"""Phase 3 worker entry point. Runs a single analysis end-to-end.

Usage:
    python -m worker.analyze <analysis_id>

What it does:
  1. Loads .env.local for SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
  2. Reads the analyses row by id (service_role bypasses RLS).
  3. Flips status to 'running'.
  4. Downloads the CSV from `csvs/<csv_storage_path>`.
  5. Parses the CSV → computes "actual" metrics → simulates each benchmark
     (with Postgres-backed price cache) → builds the Plotly figure JSON.
  6. Writes status='completed', completed_at=now(), results_json={
       figure_json: <string of JSON>,
       summary: {
         actual: <Metrics-shaped object>,
         benchmarks: { TICKER: <Metrics-shaped object>, ... },
         deposits_count: int,
         withdrawals_count: int,
         date_range: [first_iso, last_iso],
       }
     }
  7. On any exception: status='failed', error_message=<class+message+short
     traceback>. Exits non-zero.

Phase 4 will consume this shape; if anything here changes, update the
TypeScript type for results_json in src/lib/types.ts in lockstep.
"""

from __future__ import annotations

import math
import os
import re
import sys
import tempfile
import traceback
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import dotenv
from supabase import Client, create_client

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

from worker.benchmark import simulate_all
from worker.chart import build_figure_json
from worker.metrics import Metrics, compute_metrics
from worker.rh_parser import parse_robinhood_csv


# Maximum length we'll write to analyses.error_message. The column is text
# (unbounded) but storing whole stack traces is noisy; keep it bounded.
_MAX_ERR_LEN = 2000


def _serialize_metric_value(v: float | None) -> float | None:
    """JSON doesn't allow NaN/Inf — flatten them to None."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return float(v)


def _serialize_metrics(m: Metrics) -> dict[str, float | None]:
    return {
        "total_deposited": _serialize_metric_value(m.total_deposited),
        "total_withdrawn": _serialize_metric_value(m.total_withdrawn),
        "net_invested": _serialize_metric_value(m.net_invested),
        "final_value": _serialize_metric_value(m.final_value),
        "dollar_gain": _serialize_metric_value(m.dollar_gain),
        "total_return_pct": _serialize_metric_value(m.total_return_pct),
        "cagr": _serialize_metric_value(m.cagr),
        "xirr": _serialize_metric_value(m.xirr),
    }


def _load_env() -> tuple[str, str]:
    # `.env.local` lives at the repo root (this file is at worker/analyze.py).
    repo_root = Path(__file__).resolve().parent.parent
    dotenv.load_dotenv(repo_root / ".env.local")

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. "
            "Check .env.local in the repo root."
        )
    return url, key


def _mark_failed(sb: Client, analysis_id: str, err: BaseException) -> None:
    """Best-effort: write status='failed' + error_message back to the row."""
    msg = f"{type(err).__name__}: {err}"
    tb = traceback.format_exc()
    full = (msg + "\n\n" + tb)[:_MAX_ERR_LEN]
    try:
        sb.table("analyses").update(
            {"status": "failed", "error_message": full}
        ).eq("id", analysis_id).execute()
    except Exception as inner:  # noqa: BLE001
        print(
            f"  (also failed to record failure status: {inner})",
            file=sys.stderr,
        )


def main(analysis_id: str) -> int:
    # --- Validate the id format before touching the DB. The analyses.id
    # column is uuid; an invalid string would surface as a noisy postgrest
    # APIError otherwise. ---
    if not _UUID_RE.match(analysis_id):
        print(
            f"Invalid analysis id: {analysis_id!r}. Expected a UUID like "
            f"'a00b6396-3d8c-4b5d-9eeb-d4d132a68b1a'.",
            file=sys.stderr,
        )
        return 1

    try:
        url, key = _load_env()
    except Exception as e:  # noqa: BLE001
        print(f"Setup error: {e}", file=sys.stderr)
        return 1

    sb: Client = create_client(url, key)

    # --- Fetch row ---
    try:
        row = (
            sb.table("analyses")
            .select("*")
            .eq("id", analysis_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        print(f"Database error fetching analysis: {e}", file=sys.stderr)
        return 1

    if not row or not row.data:
        print(f"Analysis {analysis_id!r} not found.", file=sys.stderr)
        return 1
    a: dict[str, Any] = row.data
    print(
        f"Loaded analysis {analysis_id} "
        f"(name={a['name']!r}, status={a['status']!r}, "
        f"benchmarks={a['benchmark_tickers']})"
    )

    # --- Mark running ---
    sb.table("analyses").update({"status": "running"}).eq(
        "id", analysis_id
    ).execute()

    try:
        # --- Download CSV from storage to a temp file ---
        storage_path = a["csv_storage_path"]
        print(f"Downloading csvs/{storage_path}...")
        csv_bytes = sb.storage.from_("csvs").download(storage_path)
        if not csv_bytes:
            raise FileNotFoundError(
                f"CSV not found in storage at csvs/{storage_path}"
            )

        with tempfile.NamedTemporaryFile(
            suffix=".csv", delete=False
        ) as tmp:
            tmp.write(csv_bytes)
            tmp_path = tmp.name

        try:
            # --- Parse + simulate + metrics + figure ---
            flows = parse_robinhood_csv(tmp_path)
            if not flows:
                raise ValueError(
                    "No ACH/WIRE cash flow events found in the CSV. "
                    "Check that the file has a 'Trans Code' column with ACH "
                    "or WIRE rows."
                )

            current_value = float(a["current_value_usd"])
            tickers: list[str] = list(a["benchmark_tickers"])

            print(
                f"\nDate range: {flows[0].date} to {flows[-1].date} "
                f"({len(flows)} flow events)\n"
            )

            actual_metrics = compute_metrics(flows, current_value)
            bm_results = simulate_all(tickers, flows, sb)
            bm_metrics = {
                t: compute_metrics(flows, bm_results[t].final_value)
                for t in tickers
            }

            figure_json = build_figure_json(
                flows=flows,
                actual_final_value=current_value,
                actual_metrics=actual_metrics,
                benchmark_results=bm_results,
                benchmark_metrics=bm_metrics,
            )

            n_dep = sum(1 for f in flows if f.amount > 0)
            n_wd = sum(1 for f in flows if f.amount < 0)
            results_json = {
                "figure_json": figure_json,
                "summary": {
                    "actual": _serialize_metrics(actual_metrics),
                    "benchmarks": {
                        t: _serialize_metrics(bm_metrics[t]) for t in tickers
                    },
                    "deposits_count": n_dep,
                    "withdrawals_count": n_wd,
                    "date_range": [
                        flows[0].date.isoformat(),
                        flows[-1].date.isoformat(),
                    ],
                    "benchmark_ran_out": {
                        t: bool(bm_results[t].ran_out) for t in tickers
                    },
                    "as_of": date.today().isoformat(),
                },
            }
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass  # best-effort cleanup

        # --- Write back results ---
        sb.table("analyses").update(
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "results_json": results_json,
                "error_message": None,
            }
        ).eq("id", analysis_id).execute()

        print(f"\n✓ Analysis {analysis_id} completed.")
        return 0

    except Exception as e:  # noqa: BLE001
        _mark_failed(sb, analysis_id, e)
        print(f"\n✗ Analysis {analysis_id} failed: {e}", file=sys.stderr)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m worker.analyze <analysis_id>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
