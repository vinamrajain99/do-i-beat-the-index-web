"""Deposit-mirrored counterfactual: 'what if every ACH deposit had bought benchmark instead?'

Ported from the CLI on 2026-05-12. The math (`simulate_benchmark`) is unchanged.
The only difference is the price cache:

  CLI:  parquet files on disk under <repo>/cache/<TICKER>_adj.parquet.
  Here: rows in `public.benchmark_price_cache` (ticker, trade_date, adj_close,
        fetched_at). Reads/writes go through supabase-py with service_role,
        which bypasses RLS.

Cache freshness check: if any row for this ticker has `fetched_at >= today`,
we trust the entire cached series. Otherwise we re-fetch full history from
yfinance and upsert.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd
import yfinance as yf
from supabase import Client

from worker.rh_parser import CashFlow


HISTORICAL_START = "1990-01-01"

# Supabase REST has a max payload size per request; 1000 rows per upsert keeps
# us comfortably under it even with ~50 bytes per row of overhead.
_UPSERT_BATCH = 1000


@dataclass
class BenchmarkResult:
    ticker: str
    daily_value: pd.Series  # indexed by date, $ value of benchmark portfolio
    final_value: float
    final_shares: float
    ran_out: bool  # True if a withdrawal exceeded the benchmark's balance


def _rows_to_series(rows: list[dict]) -> pd.Series:
    if not rows:
        return pd.Series(dtype=float, name="adj_close")
    df = pd.DataFrame(rows)
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    df["adj_close"] = df["adj_close"].astype(float)
    return df.set_index("trade_date")["adj_close"].rename("adj_close").sort_index()


def _extract_close(df: pd.DataFrame) -> pd.Series:
    """yfinance may return MultiIndex columns for single-ticker calls."""
    if isinstance(df.columns, pd.MultiIndex):
        close = df["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
    else:
        close = df["Close"]
    close.index = pd.to_datetime(close.index).date
    return close.rename("adj_close").astype(float)


def _fetch_adj_close(ticker: str, sb: Client) -> pd.Series:
    """Return adjusted close prices for `ticker`, with Postgres cache."""
    ticker = ticker.upper()

    # 1. Cache freshness check: any row for this ticker with fetched_at today?
    today = date.today()
    probe = (
        sb.table("benchmark_price_cache")
        .select("ticker")
        .eq("ticker", ticker)
        .gte("fetched_at", today.isoformat())
        .limit(1)
        .execute()
    )

    if probe.data:
        # Cache fresh — pull the full series. Pagination matters because
        # Supabase REST returns at most 1000 rows by default.
        all_rows: list[dict] = []
        offset = 0
        page_size = 1000
        while True:
            page = (
                sb.table("benchmark_price_cache")
                .select("trade_date, adj_close")
                .eq("ticker", ticker)
                .order("trade_date")
                .range(offset, offset + page_size - 1)
                .execute()
            ).data
            if not page:
                break
            all_rows.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        print(f"  [cache] {ticker}: {len(all_rows)} rows from benchmark_price_cache")
        return _rows_to_series(all_rows)

    # 2. Miss — fetch from yfinance.
    print(f"  [yfinance] fetching {ticker} from {HISTORICAL_START}...")
    df = yf.download(
        ticker,
        start=HISTORICAL_START,
        end=(today + timedelta(days=1)).isoformat(),
        auto_adjust=True,
        progress=False,
    )
    if df.empty:
        raise ValueError(f"yfinance returned no data for ticker {ticker!r}")

    series = _extract_close(df)

    # 3. Upsert into the cache. Service_role bypasses RLS.
    payload = [
        {"ticker": ticker, "trade_date": d.isoformat(), "adj_close": float(v)}
        for d, v in series.items()
    ]
    for i in range(0, len(payload), _UPSERT_BATCH):
        sb.table("benchmark_price_cache").upsert(
            payload[i : i + _UPSERT_BATCH],
            on_conflict="ticker,trade_date",
        ).execute()
    print(f"  [cache] {ticker}: upserted {len(payload)} rows")

    return series


def _price_on_or_after(prices: pd.Series, d: date) -> tuple[date, float]:
    """Find the first trading day on or after d and return (that_date, price)."""
    idx = prices.index
    pos = idx.searchsorted(d)
    if pos >= len(idx):
        raise ValueError(
            f"No price available on or after {d} (last available: {idx[-1]})"
        )
    return idx[pos], float(prices.iloc[pos])


def simulate_benchmark(
    ticker: str, flows: list[CashFlow], sb: Client
) -> BenchmarkResult:
    """Walk cash flows in date order, converting each to shares of benchmark.

    Builds a daily share-count series aligned to business days, then values it
    at each day's adjusted close.
    """
    prices = _fetch_adj_close(ticker, sb)

    first_date = flows[0].date
    today = date.today()
    daily_idx = pd.bdate_range(start=first_date, end=today).date
    prices_daily = prices.reindex(daily_idx, method="ffill")

    share_track = pd.Series(0.0, index=daily_idx, dtype=float)
    cur_shares = 0.0
    ran_out = False
    fi = 0

    for d in daily_idx:
        while fi < len(flows) and flows[fi].date <= d:
            cf = flows[fi]
            try:
                _, p = _price_on_or_after(prices, cf.date)
            except ValueError as e:
                print(f"  WARNING [{ticker}]: skipping flow on {cf.date}: {e}")
                fi += 1
                continue
            if cf.amount > 0:
                cur_shares += cf.amount / p
            else:
                withdrawal = -cf.amount
                balance = cur_shares * p
                if withdrawal > balance + 1e-6:
                    print(
                        f"  WARNING [{ticker}]: would have run out of money on "
                        f"{cf.date} (needed ${withdrawal:,.2f}, had "
                        f"${balance:,.2f}). Capping at full liquidation; "
                        f"comparison broken from here forward."
                    )
                    cur_shares = 0.0
                    ran_out = True
                else:
                    cur_shares -= withdrawal / p
            fi += 1
        share_track.loc[d] = cur_shares

    daily_value = share_track * prices_daily
    daily_value.name = ticker

    return BenchmarkResult(
        ticker=ticker,
        daily_value=daily_value,
        final_value=float(daily_value.iloc[-1]),
        final_shares=float(cur_shares),
        ran_out=ran_out,
    )


def simulate_all(
    tickers: list[str], flows: list[CashFlow], sb: Client
) -> dict[str, BenchmarkResult]:
    results: dict[str, BenchmarkResult] = {}
    for t in tickers:
        print(f"Simulating benchmark {t}...")
        results[t] = simulate_benchmark(t, flows, sb)
    return results
