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
