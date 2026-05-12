@AGENTS.md

# do-i-beat-the-index-web — Claude project guide

Web app version of a Robinhood portfolio analyser. Multi-user, persisted analyses, browser UI. Companion to the CLI tool at `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/` (also on GitHub at https://github.com/vinamrajain99/do-i-beat-the-index — public, MIT).

**This repo on GitHub:** https://github.com/vinamrajain99/do-i-beat-the-index-web (private during build-out).

## What this app does

User uploads their Robinhood activity CSV, picks up to 5 benchmark tickers, enters their current portfolio value. App computes a **deposit-mirrored counterfactual** for each benchmark and shows an interactive chart + summary table (XIRR, CAGR, %/$ delta vs. actual). Up to 5 analyses persisted per user.

## The math (read before changing analysis logic)

**Deposit-mirroring**, not buy-mirroring. Only ACH/WIRE deposits and withdrawals trigger benchmark trades. Every internal Robinhood event (Buy, Sell, CDIV, DRIP, SPL, options, crypto, interest) is ignored on both sides.

- Actual portfolio value comes from the user — they type today's Robinhood total. That number already reflects every dividend reinvested, split, etc.
- Benchmark uses `yfinance` with `auto_adjust=True` (total-return adjusted close). Mathematically equivalent to DRIPing all benchmark dividends.
- Both sides DRIP. Only the asset choice differs. Apples-to-apples.

A "buy-mirroring" alternative was considered and rejected for the CLI; we inherit that decision here. See the CLI repo's CLAUDE.md and `~/.claude/plans/1-csv-export-route-kind-hartmanis.md` for the full rationale.

Δ vs actual sign convention: `(benchmark − actual)`. Negative = benchmark underperformed your picks. Positive = benchmark beat you. Match the CLI.

## Architecture (locked in — do not rethink without explicit user ask)

| Layer | Tech | Rationale |
|---|---|---|
| Frontend | Next.js 16 App Router + React 19 + TS + Tailwind v4 + shadcn/ui | Modern stack; same Vercel deploy as backend |
| Backend compute | Python serverless functions on Vercel (planned, phase 3) | Reuses the CLI's tested Python math (~1,000 LoC, sanity-tested) |
| Auth + DB + Storage | Supabase | Email/password + reset built-in; Postgres + RLS; private storage bucket |
| Charts | Plotly HTML (planned) | Matches CLI output; JSON-serializable from backend |
| Snapshots | **Frozen** at run time | User picked this — fast loads, no recompute drift |

User chose: deposit-mirror (the only math), frozen snapshots, separate repo from the CLI.

## What's built (Phases 1, 2, & 3 — complete)

All three phases pass `npx tsc --noEmit` and `npm run lint` clean. Phase 3 is
**math-only** — the worker runs locally; the HTTP wrapper and UI polling are
the next phase.

### Phase 1 — auth scaffold (commit `9b3710a` + follow-ups)

- Next.js scaffold with App Router, src/, Tailwind v4, ESLint
- shadcn/ui primitives handwritten in `src/components/ui/`: Button, Input, Label, Card
- Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` (RSC/actions), `proxy.ts` (token refresh + route protection — formerly `middleware.ts`)
- Next.js proxy at `src/proxy.ts` wires the protection logic (Next.js 16 renamed `middleware` → `proxy`)
- Auth pages in `src/app/auth/`: `login/`, `signup/`, `forgot-password/`, `reset-password/` — each with `page.tsx` + `actions.ts` (server actions using React 19 `useActionState`)
- `src/app/auth/callback/route.ts` exchanges email-link `?code=...` for a session
- `src/app/auth/sign-out/actions.ts` server action
- `src/app/page.tsx` landing page (redirects to /dashboard if signed in)
- SQL migrations in `supabase/migrations/`:
  - `20260510000000_init_schema.sql` —
    - `public.analyses` table (RLS scoped to `auth.uid()`, 4 policies)
    - 5-row-per-user trigger `public.enforce_analysis_limit()`
    - `csvs` storage bucket with per-user folder RLS
    - `public.benchmark_price_cache` table (service_role writes, authenticated reads)
  - `20260512162335_revoke_enforce_analysis_limit_execute.sql` —
    revokes EXECUTE on the trigger function from `public, anon, authenticated` so it can't be invoked via PostgREST RPC (fixes Supabase linter lints 0028/0029)
- `.env.local.example` documents the four env vars
- LICENSE (MIT), README.md, .gitignore (with negation for `.env.local.example`)
- `.mcp.json` pointing to Supabase MCP server (HTTP, OAuth)

### Phase 2 — CSV upload + new-analysis form

- `src/lib/types.ts` — shared `Analysis` type, `AnalysisStatus` union, ticker regex, and the `BENCHMARK_DEFAULTS` constant (10 curated tickers).
- `src/app/dashboard/page.tsx` — real analysis list (RLS-scoped, max 5), status badges, "+ New analysis" CTA with a disabled state at cap.
- `src/app/dashboard/new/page.tsx` — client form using `useActionState`, chip-style benchmark multiselect (10 defaults + free-form custom tickers), CSV file input.
- `src/app/dashboard/new/actions.ts` — `createAnalysisAction` server action: validates → inserts `pending` row → uploads CSV to `csvs/<uid>/<id>.csv` → redirects to `/dashboard/[id]`. Catches `analysis_limit_reached` (5-cap trigger) and rolls back the row on storage upload failure.
- `src/app/dashboard/[id]/page.tsx` — server component placeholder for the results page. Renders status-specific copy. Phase 4 replaces the body with the Plotly chart + summary table.
- `next.config.ts` — bumps `experimental.serverActions.bodySizeLimit` to `'12mb'` so 10 MB CSVs fit (default is 1 MB).

### Phase 3 — analysis worker (math-only, local CLI)

Ported from the companion CLI repo (`/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`) on 2026-05-12. Math is unchanged; only the cache backing store and the chart output shape differ.

- `worker/` Python package at the repo root.
- `worker/analyze.py` — entry point. Reads `analyses` row by id (service_role bypasses RLS), flips `status='running'`, downloads the CSV from `csvs/<uid>/<id>.csv`, parses → computes "actual" metrics → simulates each benchmark → builds a Plotly figure JSON, writes `status='completed'` + `results_json` back. On failure, writes `status='failed'` + `error_message`. Validates the analysis_id is a UUID before hitting the DB.
- `worker/rh_parser.py`, `worker/metrics.py` — verbatim ports of the CLI files (only the relative imports changed).
- `worker/benchmark.py` — port with the parquet cache replaced by `public.benchmark_price_cache` table. Freshness heuristic: if any row for this ticker has `fetched_at >= today`, the cache is trusted; otherwise re-fetch full history from yfinance and upsert.
- `worker/chart.py` — port with `render_html(...)` replaced by `build_figure_json(...)` returning `fig.to_json()`. All trace/layout construction is identical.
- `worker/requirements.txt` — pandas, yfinance, plotly, scipy, supabase, python-dotenv, python-dateutil. No pyarrow (no parquet).

`results_json` shape (consumed by Phase 4):
```jsonc
{
  "figure_json": "<Plotly figure as JSON string>",
  "summary": {
    "actual":        { total_deposited, total_withdrawn, net_invested,
                       final_value, dollar_gain, total_return_pct,
                       cagr, xirr },
    "benchmarks":    { TICKER: <same shape>, ... },
    "deposits_count": int,
    "withdrawals_count": int,
    "date_range":    [first_iso, last_iso],
    "benchmark_ran_out": { TICKER: bool, ... },
    "as_of":         "<today iso>"
  }
}
```

Run an analysis end-to-end (after `source .venv/bin/activate`):
```bash
python -m worker.analyze <analysis_id>
```

## What's NOT built yet

- **Phase 3.5** (next): wrap the worker in `api/analyze.py` (Vercel Python serverless), add a client component on `/dashboard/[id]` that triggers the analysis and polls `router.refresh()` until status changes.
- **Phase 4**: Results page `/dashboard/<analysis_id>` rendering Plotly chart from `results_json.figure_json` and a summary table from `results_json.summary`. (The route exists today as a placeholder.)
- **Phase 5**: Delete-an-analysis UI to free a slot when at the 5-cap. Today users have to free a slot via SQL.
- **Phase 6**: Deploy to Vercel. Configure prod env vars. Update Supabase Auth Redirect URLs with prod domain.

## Setup state checkpoint (as of 2026-05-12 — Phases 1, 2, & 3 fully verified)

| Item | Status |
|---|---|
| GitHub repo (private) | Pushed to `vinamrajain99/do-i-beat-the-index-web` |
| Supabase project | `do-i-beat-the-index`, ref `vqrbapbmzvqxjexgtxnf`, region `us-east-2`, `ACTIVE_HEALTHY` |
| Schema migrations applied to Supabase | ✅ Both migrations applied via MCP. Verified: 2 tables, all 4 RLS policies on `analyses`, csvs bucket + 4 storage policies, trigger in place. Security advisors: 0 lints. |
| Supabase Auth URL config | ✅ Site URL + Redirect URLs (callback + reset-password) configured |
| Supabase MCP server | ✅ OAuth + connection verified working |
| .env.local with real credentials | ✅ Populated locally (gitignored). Uses modern `sb_publishable_...` anon key. |
| Auth flow end-to-end | ✅ Verified in browser: signup → email confirm → login → logout → relogin → forgot-pw → reset |
| New-analysis flow end-to-end | ✅ Verified in browser: submit form → row inserted as `pending` → CSV in `csvs/<uid>/<id>.csv` (confirmed via MCP SQL on `storage.objects`) → redirect to `/dashboard/[id]` shows the queued placeholder |
| Worker end-to-end | ✅ `python -m worker.analyze <id>` against the real "Test analysis" row (143 deposits since 2022) completed; `status='completed'`, `results_json` populated (`figure_json` ~45 KB, full summary), SPY cache populated with 8378 rows from 1993. Second run skips yfinance (cache hit). |
| Vercel account / project | Not yet set up. Deferred to phase 6. |

## Immediate next steps

Wrap the math worker in an HTTP layer + UI polling (informally "Phase 3.5"):

- **`api/analyze.py`** (or a Next.js Route Handler at `src/app/api/analyze/route.ts` if we'd rather avoid Python on Vercel for now). Receives `{ analysis_id }`, calls `worker.analyze.main(id)`, returns success/failure.
- **Client-side trigger on `/dashboard/[id]`**: if `status='pending'`, render a client component that POSTs to the route once on mount, then polls (`router.refresh()` every 3s) until status changes. Robust to tab refreshes — reload mid-analysis just resumes polling.
- **Idempotency**: before flipping `pending → running`, the worker should reject if status is already `running` or `completed`. Tiny CAS via a Postgres WHERE clause.
- **Then Phase 4**: replace `/dashboard/[id]`'s placeholder body with the Plotly chart (rehydrate `results_json.figure_json` client-side via `plotly.js-dist-min`) plus the summary table from `results_json.summary`.

The CLI repo (`/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`) is no longer needed as a source — `worker/` is the working copy now.

## Companion CLI repo — reuse, don't re-implement

The CLI lives at `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`. Files to mine when building Phase 3:

- `rh_parser.py` — CSV → `list[CashFlow]`, filters to ACH/WIRE, parses `($500.00)` style negatives. Already tolerant of malformed rows (Python engine + on_bad_lines callable).
- `benchmark.py` — yfinance fetch with parquet caching, deposit-mirrored simulation. Replace its parquet cache with reads/writes to the Supabase `benchmark_price_cache` table.
- `metrics.py` — XIRR, CAGR, total return.
- `chart.py` — Plotly figure construction. The figure can be JSON-serialized via `fig.to_json()` and stored in `results_json`, then rehydrated client-side.
- `test_sanity.py` — four self-checks (parser, XIRR, zero-delta, withdrawal overflow). The zero-delta check is the highest-signal one.

The Δ vs actual sign convention was fixed in CLI commit `fe75c2e` (in chart.py and main.py). Make sure the web port matches: `bm.final_value - actual_final` (not the reverse).

## Critical non-obvious decisions

- **`getUser()` not `getSession()` for auth decisions.** `getSession()` reads cookies without verifying the JWT against Supabase — unsafe. The proxy uses `getUser()`.
- **`NEXT_PUBLIC_` prefix means browser-exposed.** Never prefix the service_role key. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- **5-analysis cap enforced server-side too** via the Postgres trigger `enforce_analysis_limit`. UI enforcement alone is not enough — the trigger is defense in depth and raises `analysis_limit_reached`. Surface that gracefully in the UI.
- **Storage path convention**: `csvs/<user_uid>/<analysis_id>.csv`. The RLS policy on `storage.objects` uses `(storage.foldername(name))[1] = auth.uid()::text` to enforce per-user isolation.
- **CSV parser is broker-agnostic-ish**: it only cares about rows with `Trans Code` in `{ACH, WIRE, AFCV}`. If the user's CSV doesn't have these, the parser will report 0 deposits and the analysis will be empty. Worth surfacing.

## Local development

```bash
cd /Users/aayushipandit/Desktop/Claude-Work/do-i-beat-the-index-web
cp .env.local.example .env.local
# fill in the three Supabase credentials in .env.local
npm install   # already done; safe to skip
npm run dev   # http://localhost:3000
```

### Python worker (Phase 3+)

One-time setup:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r worker/requirements.txt
```

Run an analysis against an existing `analyses` row:
```bash
source .venv/bin/activate   # if not active
python -m worker.analyze <analysis_id>
```

The worker reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Service role bypasses RLS, so the worker can read
any user's CSV and write back to any analyses row — keep the key off-cluster.

Sanity checks before any commit:

```bash
npx tsc --noEmit   # type-check
npm run lint       # eslint
```

## File map

```
src/
├── app/
│   ├── layout.tsx                 root layout + Sonner Toaster
│   ├── page.tsx                   landing (redirects to /dashboard if signed in)
│   ├── auth/
│   │   ├── layout.tsx             centered card wrapper
│   │   ├── login/                 page + action (signInWithPassword)
│   │   ├── signup/                page + action (signUp, sends confirm email)
│   │   ├── forgot-password/       page + action (resetPasswordForEmail)
│   │   ├── reset-password/        page + action (updateUser({password}))
│   │   ├── callback/route.ts      exchangeCodeForSession on email-link click
│   │   └── sign-out/actions.ts    signOut + redirect
│   └── dashboard/
│       ├── page.tsx               list of analyses (max 5) + "+ New analysis" CTA
│       ├── new/
│       │   ├── page.tsx           form: name, value, benchmark chips, CSV
│       │   └── actions.ts         createAnalysisAction (insert + upload + redirect)
│       └── [id]/page.tsx          per-analysis results (Phase 2: pending placeholder)
├── components/ui/                 Button, Input, Label, Card (shadcn primitives)
├── lib/
│   ├── utils.ts                   cn() helper (clsx + tailwind-merge)
│   ├── types.ts                   Analysis type + BENCHMARK_DEFAULTS + size/cap consts
│   └── supabase/
│       ├── client.ts              createBrowserClient
│       ├── server.ts              createServerClient with cookies()
│       └── proxy.ts               updateSession + route protection
└── proxy.ts                       Next.js proxy entrypoint (Next.js 16 renamed `middleware` → `proxy`)
supabase/migrations/               SQL migrations; apply via Dashboard or MCP
worker/                            Python analysis worker (Phase 3)
├── __init__.py                    package marker
├── __main__.py                    enables `python -m worker <id>`
├── analyze.py                     entry point: row → results_json + status flip
├── rh_parser.py                   Robinhood CSV → list[CashFlow] (verbatim port)
├── metrics.py                     XIRR + CAGR (verbatim port)
├── benchmark.py                   yfinance fetch + deposit-mirrored sim (Postgres-cached)
├── chart.py                       Plotly figure builder, returns fig.to_json()
└── requirements.txt               pandas, yfinance, plotly, scipy, supabase, dotenv
```

## Common gotchas

- **Next.js 16 is the version installed.** APIs differ from training data (see AGENTS.md). When in doubt, check `node_modules/next/dist/docs/` or upstream docs.
- **Tailwind v4** uses CSS-based config (`@theme inline`), no `tailwind.config.js`. The shadcn theme lives in `src/app/globals.css`.
- **Server actions with redirect**: `redirect()` throws — don't wrap it in try/catch.
- **`useActionState` is React 19**, not React 18's `useFormState`. Imports differ.
- **`cookies()` is async in Next.js 16+** — must `await cookies()`.
- **MCP connections are per-session.** Restart Claude Code in this directory to pick up `.mcp.json`. OAuth tokens persist; only the connection initialization is per-session.
- **Next.js 16 renamed `middleware` → `proxy`.** The convention file is `src/proxy.ts`, the exported function is `proxy`. Anything you remember as `middleware` is the old name. There's a codemod (`npx @next/codemod@canary middleware-to-proxy .`) if you ever need to redo this on another branch.

## Reference

- Original CLI repo + design docs: `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/CLAUDE.md`
- Original plan file: `~/.claude/plans/1-csv-export-route-kind-hartmanis.md`
- User email: vinamrajain99@gmail.com (also the GitHub handle: `vinamrajain99`)
