/**
 * Shared types and constants for the analysis flow.
 *
 * `ResultsJson` mirrors the dict the Python worker writes to
 * `analyses.results_json` — keep it in lockstep with the docstring at the
 * top of `worker/analyze.py`. Numeric fields can be `null` because the
 * worker flattens NaN / Inf (e.g. XIRR on a deeply negative portfolio) to
 * null at serialize time so the JSON is valid.
 */

export const BENCHMARK_DEFAULTS = [
  "SPY",
  "QQQ",
  "VOO",
  "VTI",
  "VXUS",
  "IWM",
  "DIA",
  "VEA",
  "AGG",
  "GLD",
] as const;

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

export type MetricsSummary = {
  total_deposited: number | null;
  total_withdrawn: number | null;
  net_invested: number | null;
  final_value: number | null;
  dollar_gain: number | null;
  total_return_pct: number | null;
  cagr: number | null;
  xirr: number | null;
};

export type ResultsJson = {
  figure_json: string;
  summary: {
    actual: MetricsSummary;
    benchmarks: Record<string, MetricsSummary>;
    deposits_count: number;
    withdrawals_count: number;
    date_range: [string, string];
    benchmark_ran_out: Record<string, boolean>;
    as_of: string;
  };
};

export type Analysis = {
  id: string;
  user_id: string;
  name: string;
  current_value_usd: number;
  benchmark_tickers: string[];
  csv_storage_path: string;
  status: AnalysisStatus;
  error_message: string | null;
  results_json: ResultsJson | null;
  created_at: string;
  completed_at: string | null;
};

// Enforced both client-side (UI) and server-side (validation + DB trigger).
export const MAX_ANALYSES_PER_USER = 5;
export const MAX_BENCHMARKS = 5;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

// Loose ticker shape: letters, digits, dot, dash. 1–10 chars. Covers
// standard US tickers, BRK.B, etc. Validation only — we don't pre-check
// against yfinance; the Phase 3 worker will surface any "ticker not found"
// errors into `error_message`.
export const TICKER_REGEX = /^[A-Z0-9.\-]{1,10}$/;
