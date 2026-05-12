"""Parse Robinhood activity CSV into a stream of external cash flow events.

Ported verbatim from the CLI (https://github.com/vinamrajain99/do-i-beat-the-index)
on 2026-05-12. No behavioural changes; lives here so the rest of the package
can import CashFlow from a clean module path.

Only ACH/WIRE/AFCV deposits and withdrawals are extracted. Everything else
(Buy/Sell/CDIV/DRIP/SPL/options/crypto/interest) is internal to the brokerage
and irrelevant for deposit-mirrored benchmark comparison.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Iterable

import pandas as pd


CASH_TRANSFER_CODES = {"ACH", "WIRE", "AFCV"}


@dataclass(frozen=True)
class CashFlow:
    date: date
    amount: float  # positive = deposit into Robinhood, negative = withdrawal


def _parse_amount(raw: object) -> float:
    s = str(raw).strip()
    if s in {"", "nan", "None", "NaN"}:
        return 0.0
    s = s.replace("$", "").replace(",", "").strip()
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    return float(s)


def _find_column(df: pd.DataFrame, candidates: Iterable[str]) -> str:
    cols_lower = {c.lower().strip(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    raise KeyError(
        f"None of {list(candidates)} found in CSV columns: {list(df.columns)}"
    )


def parse_robinhood_csv(csv_path: str) -> list[CashFlow]:
    # Robinhood occasionally emits rows with an unescaped comma inside the
    # Description field, which makes the strict C parser fail. The python
    # engine plus on_bad_lines='skip' tolerates this; we don't care about those
    # rows anyway since they're internal events.
    skipped: list[int] = []

    def _on_bad(bad_line: list[str]) -> None:
        skipped.append(len(bad_line))
        return None

    df = pd.read_csv(
        csv_path,
        dtype=str,
        keep_default_na=False,
        engine="python",
        on_bad_lines=_on_bad,
    )
    if skipped:
        print(
            f"  Note: skipped {len(skipped)} malformed CSV row(s) "
            f"(likely unescaped commas in Description fields)"
        )

    date_col = _find_column(df, ["Activity Date", "ActivityDate", "Date"])
    code_col = _find_column(df, ["Trans Code", "TransCode", "Code"])
    amount_col = _find_column(df, ["Amount"])

    flows: list[CashFlow] = []
    other_codes: Counter[str] = Counter()
    bad_rows = 0

    for _, row in df.iterrows():
        code = str(row[code_col]).strip().upper()
        if code not in CASH_TRANSFER_CODES:
            if code:
                other_codes[code] += 1
            continue
        try:
            amt = _parse_amount(row[amount_col])
            if amt == 0.0:
                continue
            d = pd.to_datetime(row[date_col]).date()
        except (ValueError, TypeError):
            bad_rows += 1
            continue
        flows.append(CashFlow(date=d, amount=amt))

    flows.sort(key=lambda f: f.date)

    n_dep = sum(1 for f in flows if f.amount > 0)
    n_wd = sum(1 for f in flows if f.amount < 0)
    total_other = sum(other_codes.values())
    print(
        f"Parsed {n_dep} deposits, {n_wd} withdrawals; "
        f"ignored {total_other} internal-event rows"
        + (f" ({bad_rows} unparseable)" if bad_rows else "")
    )
    if other_codes:
        top = ", ".join(f"{c}={n}" for c, n in other_codes.most_common(8))
        print(f"  Internal trans codes seen: {top}")

    return flows
