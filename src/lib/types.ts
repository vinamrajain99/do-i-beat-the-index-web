/**
 * Shared types and constants for the analysis flow.
 *
 * Phase 4 will tighten `results_json` to a real shape (Plotly figure JSON +
 * metrics summary). For Phase 2 it stays as `unknown` since no worker is
 * writing it yet.
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

export type Analysis = {
  id: string;
  user_id: string;
  name: string;
  current_value_usd: number;
  benchmark_tickers: string[];
  csv_storage_path: string;
  status: AnalysisStatus;
  error_message: string | null;
  results_json: unknown | null;
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
