# Progress log

Started 2026-05-12. Earlier same-day work (Phases 1, 2, 3 math-only) is in commit history
(`9b3710a` … `c1f8094`) and in CLAUDE.md.

## Session 2026-05-12 (evening) — Phase 3.5

**Shipped**

- HTTP wrapper for the analysis worker: `api/analyze.py` (`BaseHTTPRequestHandler` POST handler). Validates a Supabase user JWT → confirms the row's `user_id` matches the JWT `sub` → calls `worker.analyze.main(id)` → returns 200 / 400 / 401 / 403 / 500. End-to-end verified through a browser submission.
- **Idempotency CAS** moved into `worker.analyze.main`: replaced the unconditional `status='running'` flip with a `pending → running` conditional update; verified `python -m worker.analyze <completed-id>` is a clean no-op ("is not pending; nothing to do.").
- **Multi-algorithm JWT verification**. After discovering this Supabase project signs user sessions with **ES256** (asymmetric), not HS256 (symmetric shared secret), `api/analyze.py` now inspects the JWT header `alg` and routes to either the legacy HS256 path (using `SUPABASE_JWT_SECRET`) or the modern asymmetric path (using `pyjwt.PyJWKClient` against `<project>.supabase.co/auth/v1/.well-known/jwks.json`). JWKS client cached at module level.
- **Client component for trigger + polling**: `src/app/dashboard/[id]/analysis-runner.tsx`. On mount, reads the browser session, POSTs to `/api/analyze` with a Bearer token, then `setInterval(router.refresh, 3000)` until the server-rendered status flips. Retries the POST on failure. Shows a >5 min stuck-state warning.
- **Wired the runner into `src/app/dashboard/[id]/page.tsx`** (pending/running branch); replaced the "the analysis worker is the next phase" placeholder with active-worker copy.
- **No-Vercel-CLI local dev path** (`scripts/dev_python_server.py` + a dev-only `rewrites()` in `next.config.ts`): runs the same `handler` class via `ThreadingHTTPServer` on port 3001, Next.js proxies `/api/analyze` to it. Means no `vercel dev`, no `vercel login`, no `vercel link` for local verification.
- **`vercel.json`** (`maxDuration: 300`, `memory: 1024`) and **root `requirements.txt`** (adds `pyjwt`) for the eventual Phase 6 deploy.
- **`.env.local.example`** documents `SUPABASE_JWT_SECRET` (legacy-only — see DECISIONS.md).
- Verified statically (`tsc --noEmit`, `eslint`, `python -m py_compile`) and end-to-end:
  - **Negative**: 401 for no-auth, 401 for bogus token, 400 for malformed body.
  - **Happy**: Real browser submission of "Test analysis 2" (SPY benchmark) went pending → running → completed, with `results_json` populated.
  - **CAS no-op**: running the worker again on the same completed row didn't touch it.

**In progress**

- _Nothing._ Phase 3.5 is fully shipped on this branch (uncommitted as of this write).

**Blocked**

- _Nothing._

**Next session should pick up**

1. **Commit + push.** Branch `claude/sad-ptolemy-e0dd0e`, fast-forward `origin/main` via `git push origin claude/sad-ptolemy-e0dd0e:main`. 9 files changed (5 new, 4 modified).
2. **Phase 4**: render the Plotly chart + summary table on `/dashboard/[id]` from `results_json`. The data shape is already documented in `worker/analyze.py`'s docstring; mirror it into `src/lib/types.ts`. See TODO.md for the breakdown.

## Session 2026-05-12 (late evening) — Phase 4 + Phase 5

**Shipped**

- **Phase 4 — Results UI on `/dashboard/[id]`**:
  - `src/lib/types.ts` — typed `ResultsJson` (figure_json + summary { actual, benchmarks, deposits_count, withdrawals_count, date_range, benchmark_ran_out, as_of }). Tightened `Analysis.results_json` from `unknown | null` to `ResultsJson | null`. Numeric fields are `number | null` since the worker flattens NaN/Inf to null at serialize time.
  - `src/app/dashboard/[id]/plotly-chart.tsx` — client component. Dynamic-imports `plotly.js-dist-min` (gates it to client-only, code-splits the ~3 MB bundle), parses figure_json, calls `Plotly.newPlot` with `{ responsive: true }`. Cleans up with `Plotly.purge` on unmount.
  - `src/app/dashboard/[id]/results-summary.tsx` — server component. Rows: "Your portfolio" + one per benchmark. Columns: Final value / $ gain / Total return / CAGR / XIRR / Δ $ vs you / Δ % vs you. Δ uses the CLI's sign convention (`benchmark − actual`): positive in red (benchmark beat you), negative in green. Metadata strip above with deposits count, withdrawals count, date range, as-of date.
  - Page layout widened — outer `<main>` now `max-w-7xl`; header / submission / queued / failed / "no results" cards each individually `max-w-3xl mx-auto` so they don't stretch. Only the results card spans the full 1280 px.
  - `package.json` — added `plotly.js-dist-min@3.5.1` (runtime) + `@types/plotly.js-dist-min@2.3.4` (dev).
- **Chart refresh in `worker/chart.py`** — removed the embedded Plotly `go.Table` trace (now redundant with the HTML summary). Switched to `go.Figure()` (was `make_subplots`). Modern color palette (Tailwind-style blue / amber / emerald / pink / violet). Title with bold heading + muted "As of …" subtitle (via inline HTML in Plotly's title text). Abbreviated y-axis ticks (`$200K`, `$1.5M`) via `tickformat="~s"` + `tickprefix="$"`. White plot & paper background. Subtle gridlines (slate-900 @ 7% opacity). Bottom-center transparent legend. Inter / system-ui font stack throughout. Smaller deposit/withdrawal triangle markers (cap dropped from 22 → 11 px). Hover labels with white bg + light border. Figure height 900 → 600 (since the embedded table is gone).
- **Phase 5 — Delete-an-analysis UI**:
  - `src/app/dashboard/actions.ts` — `deleteAnalysisAction(analysisId)`. UUID validation → `getUser()` → RLS-scoped row lookup → row delete → best-effort `storage.from("csvs").remove([path])` → `revalidatePath("/dashboard")` + `redirect("/dashboard")`. Works cleanly from both list view (no-op redirect, list re-renders) and detail view (navigates back).
  - `src/app/dashboard/delete-button.tsx` — `"use client"` component. Pops `window.confirm()` ("Delete '<name>'? This frees a slot..."), invokes the action via `useTransition`. `preventDefault` + `stopPropagation` so the click doesn't trigger the wrapping `<Link>` in the list view.
  - `src/app/dashboard/page.tsx` — each list row restructured into a `<li>` flex container with the `<Link>` and the `<DeleteButton>` as siblings (not nested). Hover state on the `<li>`, click navigation on the link, delete handled separately. Stale "Delete UI coming in a later phase" copy replaced.
  - `src/app/dashboard/[id]/page.tsx` — Delete button in the footer (bottom-left), opposite "Back to dashboard" (justify-between).
- **Verified end-to-end**:
  - `npx tsc --noEmit` and `npm run lint` clean throughout.
  - Submitted a fresh analysis with the restarted Python dev server. Chart rendered with the new typography, blue line (#2563eb), abbreviated `$200K` ticks, white plot bg, "Portfolio vs. benchmark over time" title + "As of May 12, 2026" subtitle.
  - HTML summary table showed Your portfolio + SPY row with `+$25,494 / +12.75%` Δ in red (SPY beat the user's picks).
  - Delete from list: confirm → row vanishes → count drops → "+ New analysis" re-enables.
  - Delete from detail page: confirm → redirect to /dashboard → row gone.
- **Commit**: `740680f Phase 4 + 5: results UI (chart + summary table) + delete-analysis UI`. Pushed to `origin/main` (fast-forward from `c9e840b`).

**Stumbles worth noting**

- First Phase 4 chart render duplicated the metrics table: the worker's pre-existing Plotly figure had a `go.Table` trace baked in, and I'd just added an HTML summary table. Removed the Plotly table.
- After editing `worker/chart.py`, the styling didn't show up — Python's already-running `dev_python_server.py` had `worker.chart` cached in memory. Restarting the Python process and submitting a new analysis fixed it. **Reminder for future module edits**: `Ctrl+C` Terminal A, restart it; Next.js HMR handles JS-side hot-reload but the Python server is fresh-process-only.
- One mass-UPDATE was correctly blocked by permissions: I tried to reset all `completed` rows to `pending` to regenerate their figure_json under the new chart.py. The right path was to delete + re-submit (user opted for that). Three pre-styling rows still hold the old chart JSON; flagged in TODO.md as a cleanup chore.

**In progress**

- _Nothing._ Phase 4 + 5 are fully shipped and on `origin/main`.

**Blocked**

- _Nothing._

**Next session should pick up**

**Phase 6 — Vercel deploy**. The repo is deploy-ready: `vercel.json` + root `requirements.txt` + `api/analyze.py` are in place. Open question: confirm the Vercel plan supports `maxDuration: 300` or downgrade to `60`. Full breakdown in TODO.md → Now.
