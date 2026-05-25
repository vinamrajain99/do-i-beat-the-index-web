@AGENTS.md

# do-i-beat-the-index-web — Claude project guide

Web app version of a Robinhood portfolio analyser. Multi-user, persisted analyses, browser UI.

- **CLI companion** (source of the math): https://github.com/vinamrajain99/do-i-beat-the-index (MIT).
- **This repo on GitHub:** https://github.com/vinamrajain99/do-i-beat-the-index-web (public).
- **Production deploy:** https://do-i-beat-the-index-web.vercel.app — Vercel Hobby tier, builds from `main`. Phases 1–6 shipped.

## Session handoff state

The "what just shipped / what's next / what we decided" trail is split across three
append-only files at the repo root. Read them at the start of every session
before touching code:

- **PROGRESS.md** — session log
- **TODO.md** — backlog + blocked items
- **DECISIONS.md** — ADR-style architectural decision log

This file (CLAUDE.md) is the durable context — architecture, locked-in math,
conventions, gotchas. Do NOT add session-specific work notes here.

**Sanity check on resume**:
```bash
git status
git log --oneline -3
npx tsc --noEmit && npm run lint
.venv/bin/python -c "from worker.analyze import main; print('worker OK')"
.venv/bin/python -c "from api.analyze import handler; print('http handler OK')"
```

## What this app does

User uploads their Robinhood activity CSV, picks up to 5 benchmark tickers, enters their current portfolio value. App computes a **deposit-mirrored counterfactual** for each benchmark and shows an interactive chart + summary table (XIRR, CAGR, %/$ delta vs. actual). Up to 5 analyses persisted per user.

## The math (read before changing analysis logic)

**Deposit-mirroring**, not buy-mirroring. Only ACH/WIRE deposits and withdrawals trigger benchmark trades. Every internal Robinhood event (Buy, Sell, CDIV, DRIP, SPL, options, crypto, interest) is ignored on both sides.

- Actual portfolio value comes from the user — they type today's Robinhood total. That number already reflects every dividend reinvested, split, etc.
- Benchmark uses `yfinance` with `auto_adjust=True` (total-return adjusted close). Mathematically equivalent to DRIPing all benchmark dividends.
- Both sides DRIP. Only the asset choice differs. Apples-to-apples.

A "buy-mirroring" alternative was considered and rejected for the CLI; we inherit that decision here. See the CLI repo's CLAUDE.md and `~/.claude/plans/1-csv-export-route-kind-hartmanis.md` for the full rationale.

**Δ vs actual sign convention**: `(benchmark − actual)`. Negative = benchmark underperformed your picks. Positive = benchmark beat you. Match the CLI. The CLI fix landed in commit `fe75c2e` — make sure the web port matches: `bm.final_value - actual_final` (not the reverse).

## Architecture (locked in — do not rethink without explicit user ask)

| Layer | Tech | Rationale |
|---|---|---|
| Frontend | Next.js 16 App Router + React 19 + TS + Tailwind v4 + shadcn/ui | Modern stack; same Vercel deploy as backend |
| Backend compute | Python serverless function (`api/analyze.py`) on Vercel | Reuses the CLI's tested Python math (~1,000 LoC) |
| Auth + DB + Storage | Supabase | Email/password + reset built-in; Postgres + RLS; private storage bucket |
| Transactional email | **Resend** SMTP, wired via Supabase Auth → SMTP Settings | Replaces Supabase built-in SMTP (2/hour project-wide cap). Currently uses Resend's shared `onboarding@resend.dev` sender — emails land in spam on Gmail. Custom-domain DNS setup is a Phase-7-polish item in TODO. |
| Charts | Plotly figure JSON (built server-side, rehydrated in the browser) | Matches CLI output |
| Snapshots | **Frozen** at run time | User picked this — fast loads, no recompute drift |

User chose: deposit-mirror (the only math), frozen snapshots, separate repo from the CLI.

## End-to-end flow today

1. **Sign in** via Supabase email/password (`src/app/auth/...`).
2. **Submit form** at `/dashboard/new` → server action validates, inserts a `pending` row in `public.analyses`, uploads the CSV to `csvs/<uid>/<id>.csv`, redirects to `/dashboard/[id]`.
3. **`/dashboard/[id]` mounts** the `AnalysisRunner` client component (only when status is `pending`/`running`). The runner reads the browser session, POSTs `{analysis_id}` to `/api/analyze` with an `Authorization: Bearer <user-jwt>` header.
4. **`api/analyze.py`** (Vercel Python serverless or local Python dev server, see "Local development" below) verifies the JWT, confirms the row's `user_id` matches, then calls `worker.analyze.main(id)`.
5. **`worker.analyze.main`** does a `pending → running` **CAS** (atomic conditional update — returns 0 if the row isn't pending). If the CAS wins, it downloads the CSV, parses, computes "actual" metrics, simulates each benchmark via the cached yfinance prices in `public.benchmark_price_cache`, builds the Plotly figure JSON, and writes `status='completed'` + `results_json` back. On any error: `status='failed'` + `error_message`.
6. **Client polls** `router.refresh()` every 3 s. The server re-render reflects the new status; once `completed` or `failed`, the runner unmounts and polling stops.
7. **`completed` state** renders the `PlotlyChart` (`results_json.figure_json` rehydrated client-side via `Plotly.newPlot`) and the `ResultsSummary` HTML table (`results_json.summary`).
8. **Delete**: a `DeleteButton` on each list row and on the detail-page footer invokes `deleteAnalysisAction` — RLS-scoped row delete + best-effort CSV cleanup + redirect to `/dashboard`.

`results_json` shape (frozen contract between worker and frontend — keep `worker/analyze.py`, `src/lib/types.ts`, and the HTML summary in lockstep):
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

Metric values that would be NaN/Inf (e.g. XIRR on a deeply negative portfolio) are flattened to `null` at serialize time — both the worker's `_serialize_metric_value` and the TS `MetricsSummary` type encode this.

## Critical non-obvious decisions

- **`getUser()` not `getSession()` for auth decisions.** `getSession()` reads cookies without verifying the JWT against Supabase — unsafe. The proxy uses `getUser()`.
- **`NEXT_PUBLIC_` prefix means browser-exposed.** Never prefix the service_role key. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- **5-analysis cap enforced server-side too** via the Postgres trigger `enforce_analysis_limit`. UI enforcement alone is not enough — the trigger is defense in depth and raises `analysis_limit_reached`. Surface that gracefully in the UI.
- **Storage path convention**: `csvs/<user_uid>/<analysis_id>.csv`. The RLS policy on `storage.objects` uses `(storage.foldername(name))[1] = auth.uid()::text` to enforce per-user isolation.
- **CSV parser is broker-agnostic-ish**: it only cares about rows with `Trans Code` in `{ACH, WIRE, AFCV}`. If the user's CSV doesn't have these, the parser will report 0 deposits and the analysis will be empty. Worth surfacing.
- **CAS lives inside `worker.analyze.main`** (not in the HTTP wrapper). The atomic `pending → running` update is the only source of truth for "this row is mine to process." Both the CLI invocation and the HTTP wrapper inherit idempotency from it.
- **Supabase uses asymmetric JWTs (ES256) on this project**, not the dashboard's "JWT Secret" (HS256). `api/analyze.py` inspects the JWT header `alg` and routes to either the legacy HS256 path (using `SUPABASE_JWT_SECRET`) or the modern asymmetric path (using `pyjwt.PyJWKClient` against `<project>.supabase.co/auth/v1/.well-known/jwks.json`). See DECISIONS.md (2026-05-12 entry) for the discovery and rationale. `SUPABASE_JWT_SECRET` is optional in prod for asymmetric-flow projects.
- **Local dev uses a stand-alone Python HTTP server**, not `vercel dev`. See "Local development" below + DECISIONS.md.
- **Chart and metrics table are decoupled.** `worker/chart.py` returns a chart-only Plotly figure. The metrics summary is rendered as a native HTML `<table>` in `src/app/dashboard/[id]/results-summary.tsx`. The HTML version is theme-aware, accessible, and easy to restyle. See DECISIONS.md.
- **Both password reset and signup confirmation use `token_hash` + `verifyOtp` (verify-on-submit), not `?code=` exchange (verify-on-GET).** Email links point directly at `/auth/reset-password?token_hash=…&type=recovery` or `/auth/confirm?token_hash=…&type=email`; `verifyOtp` runs only inside the form's submit action so link pre-scanners (Gmail, etc.) can't burn the single-use token. **Two paired Supabase Dashboard email templates** must use the right URL: "Reset Password" → `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`; "Confirm signup" → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. If either gets reset to the default `{{ .ConfirmationURL }}`, that flow silently breaks. `/auth/callback` has been deleted (no remaining caller). See DECISIONS.md (2026-05-23, two entries).
- **Page layout uses per-card max-widths**, not a single page-level constraint. Outer `<main>` is `max-w-7xl`; text-shaped cards (header, overview section, queued, failed) carry `max-w-3xl mx-auto w-full` individually; the results card spans the full 1280 px. The overview "section" wraps a 2-column md grid of two cards (Cash flow + Current value), so the `max-w-3xl` is on the section, not each inner card. When adding new cards, be deliberate about which width to apply. See DECISIONS.md.
- **Global nav is load-bearing for brand-as-home + Sign out + page links.** `src/components/nav-bar.tsx` is mounted in the root layout above every route, including `/auth/*`. The `/auth/*` layout no longer has a local "← Home" link and `/dashboard` no longer has a local Sign-out form — both moved into the nav. If a future change removes the nav for a specific route (e.g. an onboarding wizard), those affordances need to be re-added page-locally. Conversely: don't re-add a Sign-out form inside a dashboard page while the nav still owns it. `/about` is intentionally public (not in `PROTECTED_PREFIXES`). See DECISIONS.md (2026-05-25).

## Local development

```bash
cd do-i-beat-the-index-web
cp .env.local.example .env.local
# fill in the four Supabase credentials (the JWT secret is optional for
# projects on the asymmetric-key auth flow; leave blank if so)
npm install   # already done; safe to skip
```

### Two terminals to exercise the full flow

**Terminal A — Python handler** (serves `api/analyze.py` on port 3001 via stdlib `ThreadingHTTPServer`):

```bash
.venv/bin/python scripts/dev_python_server.py
```

**Terminal B — Next.js** (serves the UI on port 3000; a dev-only rewrite in `next.config.ts` proxies `/api/analyze` → `127.0.0.1:3001`):

```bash
npm run dev
```

If only the UI changed, you don't need Terminal A. If only `api/analyze.py` or anything under `worker/` changed, Ctrl-C and restart Terminal A — Python's `BaseHTTPRequestHandler` doesn't hot-reload.

### Run the worker directly (CLI, no HTTP)

Useful for diagnosing whether a bug is in the HTTP layer or the math layer.

```bash
.venv/bin/python -m worker.analyze <analysis_id>
```

The worker reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Service role bypasses RLS — keep the key off-cluster.

### One-time Python venv setup

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt   # root requirements.txt; worker/requirements.txt is a stub `-r ../requirements.txt`
```

### Sanity checks before any commit

```bash
npx tsc --noEmit                                        # type-check
npm run lint                                            # eslint
.venv/bin/python -m py_compile api/analyze.py worker/analyze.py   # python syntax
```

## File map

```
src/
├── app/
│   ├── layout.tsx                 root layout + global NavBar + Sonner Toaster
│   ├── page.tsx                   landing (redirects to /dashboard if signed in)
│   ├── about/page.tsx             /about — public methodology page (server; gates closing CTA on !user)
│   ├── auth/
│   │   ├── layout.tsx             centered card wrapper (no local Home link — global nav owns it)
│   │   ├── login/                 page + action (signInWithPassword)
│   │   ├── signup/                page + action (signUp + confirm email)
│   │   ├── forgot-password/       page + action (resetPasswordForEmail; redirectTo → /auth/reset-password)
│   │   ├── reset-password/        page (server, reads token_hash from searchParams) + form.tsx (client form) + actions.ts (verifyOtp + updateUser)
│   │   ├── confirm/               same shape as reset-password, but for signup email confirmation: page (server) + form.tsx (client, single "Confirm email" button) + actions.ts (verifyOtp({type:'email'}) → /dashboard)
│   │   └── sign-out/actions.ts    signOut + redirect
│   └── dashboard/
│       ├── page.tsx               list of analyses (max 5) + "+ New analysis" CTA + per-row Delete (no local Sign-out — global nav owns it)
│       ├── actions.ts             deleteAnalysisAction (row delete + CSV cleanup + redirect)
│       ├── delete-button.tsx      client: confirm + invoke deleteAnalysisAction
│       ├── new/
│       │   ├── page.tsx           form: name, value, benchmark chips, CSV
│       │   └── actions.ts         createAnalysisAction (insert + upload + redirect)
│       └── [id]/
│           ├── page.tsx           server: header, overview (Cash flow + Current value cards w/ animated loading dots when pending/running), status-keyed body, delete in footer
│           ├── analysis-runner.tsx  client: POST /api/analyze + 3s polling
│           ├── plotly-chart.tsx   client: dynamic import of plotly.js-dist-min + Plotly.newPlot
│           └── results-summary.tsx  server: HTML metrics table (Your portfolio + benchmarks + Δ)
├── components/
│   ├── nav-bar.tsx                global top sticky nav (server; getUser-aware; signed-in vs signed-out variants)
│   ├── nav-link.tsx               client child of nav-bar; active-route highlight via usePathname
│   └── ui/                        Button, Input, Label, Card (shadcn primitives)
├── lib/
│   ├── utils.ts                   cn() helper
│   ├── types.ts                   Analysis + ResultsJson/MetricsSummary types + caps
│   └── supabase/
│       ├── client.ts              createBrowserClient
│       ├── server.ts              createServerClient with cookies()
│       └── proxy.ts               updateSession + route protection
└── proxy.ts                       Next.js proxy entrypoint (Next.js 16 renamed `middleware` → `proxy`)

api/
└── analyze.py                     Vercel Python serverless: JWT verify + worker.analyze.main()

worker/                            Python analysis package
├── __init__.py, __main__.py       enables `python -m worker <id>`
├── analyze.py                     entry: CAS + parse + simulate + write-back
├── rh_parser.py                   Robinhood CSV → list[CashFlow]
├── metrics.py                     XIRR + CAGR
├── benchmark.py                   yfinance + deposit-mirrored sim (Postgres cache)
├── chart.py                       Plotly figure builder → fig.to_json() (chart only; no table)
└── requirements.txt               stub: `-r ../requirements.txt`

scripts/
└── dev_python_server.py           stdlib ThreadingHTTPServer wrapping the api/analyze handler (local dev only)

supabase/migrations/               SQL migrations; apply via Dashboard or MCP
requirements.txt                   root Python deps (Vercel reads from here)
vercel.json                        function config: maxDuration 60 (Hobby), memory 1024
next.config.ts                     server-actions body limit + dev-only rewrite to localhost:3001
```

## Common gotchas

- **Next.js 16 is the version installed.** APIs differ from training data (see AGENTS.md). When in doubt, check `node_modules/next/dist/docs/` or upstream docs.
- **Tailwind v4** uses CSS-based config (`@theme inline`), no `tailwind.config.js`. The shadcn theme lives in `src/app/globals.css`.
- **Server actions with redirect**: `redirect()` throws — don't wrap it in try/catch.
- **`useActionState` is React 19**, not React 18's `useFormState`. Imports differ.
- **`cookies()` is async in Next.js 16+** — must `await cookies()`.
- **MCP connections are per-session.** Restart Claude Code in this directory to pick up `.mcp.json`. OAuth tokens persist; only the connection initialization is per-session.
- **Next.js 16 renamed `middleware` → `proxy`.** The convention file is `src/proxy.ts`, the exported function is `proxy`. There's a codemod (`npx @next/codemod@canary middleware-to-proxy .`) if you need to redo this on another branch.
- **Worktrees do NOT share gitignored files.** `.venv/`, `.env.local`, `.vercel/` etc. each need to be created per worktree. The previous session's `.env.local` only exists in that worktree.
- **`Date.now()` in a React server component trips ESLint's `react-hooks/purity` rule.** If you need a freshness check in an RSC, derive it in a client component or use the row's timestamps server-side without `Date.now()`.

## Reference

- **CLI companion** (math source + design docs, **internal-only reference** — README.md no longer mentions this repo, see DECISIONS.md 2026-05-24 "README is self-contained"): https://github.com/vinamrajain99/do-i-beat-the-index. The CLI's `test_sanity.py` is the regression target if you want to port it.
- **Plan files used historically**:
  - `~/.claude/plans/1-csv-export-route-kind-hartmanis.md` — deposit-mirror design rationale
  - `~/.claude/plans/resumed-functional-unicorn.md` — Phases 1–3 plan
  - `~/.claude/plans/get-yourself-familiarized-with-snoopy-hickey.md` — Phase 3.5 plan
- **Supabase project ref**: `vqrbapbmzvqxjexgtxnf` (use with `mcp__supabase__*` tools)
