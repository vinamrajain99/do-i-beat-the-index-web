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

## What's built (Phase 1 — complete)

**Commit `9b3710a` (and follow-ups):** Auth scaffold. Passes `npx tsc --noEmit` and `npm run lint` clean.

- Next.js scaffold with App Router, src/, Tailwind v4, ESLint
- shadcn/ui primitives handwritten in `src/components/ui/`: Button, Input, Label, Card
- Supabase clients in `src/lib/supabase/`: `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (token refresh + route protection)
- Next.js middleware at `src/middleware.ts` wires the protection logic
- Auth pages in `src/app/auth/`: `login/`, `signup/`, `forgot-password/`, `reset-password/` — each with `page.tsx` + `actions.ts` (server actions using React 19 `useActionState`)
- `src/app/auth/callback/route.ts` exchanges email-link `?code=...` for a session
- `src/app/auth/sign-out/actions.ts` server action
- `src/app/dashboard/page.tsx` protected page (placeholder; analysis list coming phase 5)
- `src/app/page.tsx` landing page (redirects to /dashboard if signed in)
- SQL migration `supabase/migrations/20260510000000_init_schema.sql`:
  - `public.analyses` table (RLS scoped to `auth.uid()`, 4 policies)
  - 5-row-per-user trigger `public.enforce_analysis_limit()`
  - `csvs` storage bucket with per-user folder RLS
  - `public.benchmark_price_cache` table (service_role writes, authenticated reads)
- `.env.local.example` documents the four env vars
- LICENSE (MIT), README.md, .gitignore (with negation for `.env.local.example`)
- `.mcp.json` pointing to Supabase MCP server (HTTP, OAuth)

## What's NOT built yet

- **Phase 2**: CSV upload UI → Supabase Storage `csvs/<uid>/<analysis_id>.csv`. New analysis form (benchmarks multi-select up to 5, current_value input, CSV file input). DB row inserted with `status='pending'`.
- **Phase 3**: Python serverless `/api/analyze`. Receives `analysis_id`, fetches CSV from storage using service_role, runs the CLI math (port `rh_parser.py`, `benchmark.py`, `metrics.py` from the CLI repo as needed), writes `results_json` and `status='completed'`. Use `benchmark_price_cache` table to avoid re-fetching from yfinance.
- **Phase 4**: Results page `/dashboard/<analysis_id>` rendering Plotly chart from `results_json` and a summary table.
- **Phase 5**: Dashboard analysis list (5 max), delete-to-free-slot UI, friendly error when at cap.
- **Phase 6**: Deploy to Vercel. Configure prod env vars. Update Supabase Auth Redirect URLs with prod domain.

## Setup state checkpoint (as of last session)

| Item | Status |
|---|---|
| GitHub repo (private) | Created and pushed to `vinamrajain99/do-i-beat-the-index-web` |
| Supabase project | **Created by user** (project name: `do-i-beat-the-index`). Region/ref not yet shared with Claude. |
| Schema migration applied to Supabase | **NOT YET**. SQL is in `supabase/migrations/20260510000000_init_schema.sql`; needs to be run in the project. |
| Supabase Auth URL config | **NOT YET DONE**. User must set Site URL = `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs. |
| Supabase MCP server | OAuth completed in user's terminal session. Need to verify tools are visible after Claude Code session restart. |
| .env.local with real credentials | **NOT YET CREATED**. User has not pasted the three keys (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). |
| Vercel account / project | Not yet set up. Deferred to phase 6. |

## Immediate next steps (for the resumed session)

1. **Verify Supabase MCP tools are visible** (look for `mcp__supabase__*` tools).
2. **Apply the schema migration** to the user's Supabase project via the MCP (or fall back to manual paste into the Dashboard SQL Editor if MCP is unavailable). The file is at `supabase/migrations/20260510000000_init_schema.sql`.
3. **Configure Supabase Auth URLs** (Site URL + Redirect URLs) — can also be done via MCP if supported, otherwise direct user to the Dashboard.
4. **Get the user's Supabase credentials** (URL, anon key, service_role key) and either help them write `.env.local` or have them do it themselves.
5. **Run the dev server and verify auth flow end-to-end**: signup → email confirm → log in → dashboard → sign out → log back in → forgot password → reset.
6. Once verified, start **Phase 2** (CSV upload).

## Companion CLI repo — reuse, don't re-implement

The CLI lives at `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`. Files to mine when building Phase 3:

- `rh_parser.py` — CSV → `list[CashFlow]`, filters to ACH/WIRE, parses `($500.00)` style negatives. Already tolerant of malformed rows (Python engine + on_bad_lines callable).
- `benchmark.py` — yfinance fetch with parquet caching, deposit-mirrored simulation. Replace its parquet cache with reads/writes to the Supabase `benchmark_price_cache` table.
- `metrics.py` — XIRR, CAGR, total return.
- `chart.py` — Plotly figure construction. The figure can be JSON-serialized via `fig.to_json()` and stored in `results_json`, then rehydrated client-side.
- `test_sanity.py` — four self-checks (parser, XIRR, zero-delta, withdrawal overflow). The zero-delta check is the highest-signal one.

The Δ vs actual sign convention was fixed in CLI commit `fe75c2e` (in chart.py and main.py). Make sure the web port matches: `bm.final_value - actual_final` (not the reverse).

## Critical non-obvious decisions

- **`getUser()` not `getSession()` for auth decisions.** `getSession()` reads cookies without verifying the JWT against Supabase — unsafe. Middleware uses `getUser()`.
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
│   └── dashboard/page.tsx         protected; placeholder for analysis list
├── components/ui/                 Button, Input, Label, Card (shadcn primitives)
├── lib/
│   ├── utils.ts                   cn() helper (clsx + tailwind-merge)
│   └── supabase/
│       ├── client.ts              createBrowserClient
│       ├── server.ts              createServerClient with cookies()
│       └── middleware.ts          updateSession + route protection
└── middleware.ts                  Next.js middleware entrypoint
supabase/migrations/               SQL migrations; apply via Dashboard or MCP
```

## Common gotchas

- **Next.js 16 is the version installed.** APIs differ from training data (see AGENTS.md). When in doubt, check `node_modules/next/dist/docs/` or upstream docs.
- **Tailwind v4** uses CSS-based config (`@theme inline`), no `tailwind.config.js`. The shadcn theme lives in `src/app/globals.css`.
- **Server actions with redirect**: `redirect()` throws — don't wrap it in try/catch.
- **`useActionState` is React 19**, not React 18's `useFormState`. Imports differ.
- **`cookies()` is async in Next.js 16+** — must `await cookies()`.
- **MCP connections are per-session.** Restart Claude Code in this directory to pick up `.mcp.json`. OAuth tokens persist; only the connection initialization is per-session.

## Reference

- Original CLI repo + design docs: `/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/CLAUDE.md`
- Original plan file: `~/.claude/plans/1-csv-export-route-kind-hartmanis.md`
- User email: vinamrajain99@gmail.com (also the GitHub handle: `vinamrajain99`)
