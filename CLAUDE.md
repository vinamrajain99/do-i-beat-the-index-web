@AGENTS.md

# do-i-beat-the-index-web — Claude project guide

Web app version of a Robinhood portfolio analyser. Multi-user, persisted analyses, browser UI. Companion to the CLI tool at `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/` (also on GitHub at https://github.com/vinamrajain99/do-i-beat-the-index — public, MIT).

**This repo on GitHub:** https://github.com/vinamrajain99/do-i-beat-the-index-web (private during build-out).

## Resume from here (2026-05-12, end of session)

**Where we left off**: Phases 1, 2, and 3 (math-only) are shipped and pushed to `origin/main`. Latest commit on `main`: `c1f8094 Phase 3 (math-only): port CLI analysis worker into worker/`. Working tree clean.

**What works today**, end-to-end:
- User can sign up, confirm email, log in, log out, reset password.
- User can submit a new analysis at `/dashboard/new` (name, $value, 1–5 benchmark chips, CSV upload).
- A `pending` row is written to `public.analyses`, the CSV lives at `csvs/<uid>/<id>.csv`.
- Running `python -m worker.analyze <id>` against any `pending` row flips it to `completed` with `results_json` populated (Plotly figure JSON + per-benchmark summary).
- Cache lives in `public.benchmark_price_cache`; subsequent runs against the same ticker skip yfinance.

**Verified completed example row** (handy for re-verifying or for Phase 4 UI work):
- `id = a00b6396-3d8c-4b5d-9eeb-d4d132a68b1a`
- Name: "Test analysis", 143 real Robinhood deposits 2022–2026, benchmark `SPY`.
- Note: current_value was entered as `$1000` (placeholder), so the actual XIRR shows −99.8%. Math is right; input was a typo. Either swap in a realistic current value via SQL update, or submit a new analysis from the UI to get a row with sensible numbers.

**What's NOT built yet** (in priority order):
1. **Wrap the worker in HTTP + add UI polling** (informally "Phase 3.5"). See the "Immediate next steps" section below for the full breakdown. Until this is done, the worker is invoked manually from the terminal; the user sees "Queued" on `/dashboard/[id]` forever.
2. **Phase 4** — replace `/dashboard/[id]`'s placeholder body with the actual Plotly chart (rehydrate `results_json.figure_json`) and the summary table (`results_json.summary`).
3. **Phase 5** — delete-an-analysis UI to free a slot at the 5-cap. Currently freeable only via SQL.
4. **Phase 6** — Vercel deploy + prod env vars + prod Auth Redirect URLs.

**Session housekeeping on pickup**:
- The dev server was stopped at the end of the previous session. Restart with `npm run dev`.
- The Python venv at `.venv/` is set up and gitignored. `source .venv/bin/activate` to use it.
- `.env.local` exists locally (gitignored) and is populated with the real Supabase credentials — don't regenerate.
- This branch is `claude/great-lumiere-b3af28`. The pattern in previous sessions was: commit on the branch, then `git push origin claude/great-lumiere-b3af28:main` to fast-forward main. The user's main checkout outside this worktree is two commits behind `origin/main`; a `git pull` from there will FF.

**Sanity check on resume** (in order):
```bash
git status                          # should be clean
git log --oneline -1                # c1f8094 Phase 3 (math-only)...
npx tsc --noEmit && npm run lint    # both should pass
source .venv/bin/activate && python -c "from worker.analyze import main; print('worker imports OK')"
```

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

The next chunk wraps the math worker in HTTP + UI polling (informally "Phase 3.5"). It's the smallest unit of work that turns a manual `python -m worker.analyze` invocation into the user-facing "submit form → wait → see results" loop. Order suggested:

### Step 1 — Pick the HTTP runtime

Two reasonable shapes; user has not committed to one yet. Surface this as an `AskUserQuestion` at the top of the next session:

- **(A) Vercel Python serverless at `api/analyze.py`** — matches the architecture table at the top of this file. Requires `requirements.txt` at project root (separate from npm's `package.json`), `vercel.json` runtime hint, and `vercel dev` for local fidelity. Bundle size (~160 MB with pandas+scipy+yfinance+plotly) fits the 250 MB Vercel limit. Cold starts ~5–10s.
- **(B) Next.js Route Handler at `src/app/api/analyze/route.ts`** that spawns the existing Python worker via `child_process.spawn('python', ['-m', 'worker.analyze', id])`. Single deploy, no Python serverless. Brittle on Vercel (Python binary may not be present in the Node serverless image) but works trivially in local dev.

(A) is the architecturally-honest path. (B) is fine for getting it working locally first if Vercel is being deferred.

### Step 2 — Idempotency CAS

Before the worker flips status `pending → running`, it should reject if the row is already `running` or `completed`. Use a conditional update (Postgres returns the updated row, or empty if no match):

```python
res = sb.table("analyses").update({"status": "running"}) \
    .eq("id", analysis_id).eq("status", "pending").execute()
if not res.data:
    # Someone else already grabbed it, or it's not pending anymore.
    return 0  # not an error — just nothing to do
```

This protects against double-trigger from the client (page mount + polling overlap) and from a stuck `running` row being re-triggered.

### Step 3 — Client trigger + poll on `/dashboard/[id]`

Currently `src/app/dashboard/[id]/page.tsx` is a pure server component. Convert it to render a small client component when `status in {'pending', 'running'}`:

- On mount: `fetch('/api/analyze', { method: 'POST', body: JSON.stringify({ analysis_id: id }) })`. Don't await; let it run.
- Poll `router.refresh()` every ~3s while `status` stays pending/running. Stop polling once the page re-renders with `completed` or `failed`.
- Failure state: show `error_message` (already on the row) when `status='failed'`.

The page should remain functional with JS off — server-side rendering of the row + status badge is what the current code already does. The client component is layered on top for polling.

### Step 4 — Phase 4 (the chart UI)

Replace `/dashboard/[id]`'s placeholder body when `status='completed'`:

- Install `plotly.js-dist-min` (or `react-plotly.js` for a React wrapper).
- Client component that takes `results_json.figure_json` (string) and renders the figure: `Plotly.newPlot(div, JSON.parse(figureJson).data, JSON.parse(figureJson).layout)`.
- Below the chart, render a table from `results_json.summary` (actual row + one row per benchmark, with the Δ-vs-actual columns).
- Add TypeScript types for `results_json` in `src/lib/types.ts`. Shape is documented at the top of `worker/analyze.py` and in the "Phase 3" section above — keep them in lockstep.

### What was already considered & rejected

- **Bring Vercel deploy (Phase 6) forward to coincide with the HTTP wrapper**: rejected by the user mid-Phase-3 ("Math + worker module only"). Keep deferred unless they change their mind.
- **Direct browser-to-Supabase upload** in the create action (instead of the server action streaming the CSV): rejected for Phase 2 since 10 MB fits comfortably through Vercel's body limits with `bodySizeLimit: '12mb'`. Don't re-litigate.
- **Supabase pg_net trigger** instead of client-side polling: rejected for being overkill at this scale.

The CLI repo (`/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`) is no longer needed as a source — `worker/` is the working copy now. The CLI's `test_sanity.py` is the closest thing to a regression suite if you want to port that too.
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

- Original CLI repo + design docs: `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/CLAUDE.md`. The CLI's `test_sanity.py` is a useful regression target if you want to port it.
- Original plan file (for the CLI's deposit-mirror design rationale): `~/.claude/plans/1-csv-export-route-kind-hartmanis.md`
- Plan file from the last Claude session that built Phases 1–3 (kept for reference; not re-read on resume): `~/.claude/plans/resumed-functional-unicorn.md`
- User email: vinamrajain99@gmail.com (also the GitHub handle: `vinamrajain99`)
- Supabase project ref: `vqrbapbmzvqxjexgtxnf` (use with `mcp__supabase__*` tools)
