# TODO

## Now

- [ ] **Phase 4** — render `/dashboard/[id]` results from `results_json`
  - [ ] Add TypeScript type for `results_json` shape in `src/lib/types.ts` (mirror the dict written by `worker/analyze.py`)
  - [ ] Install `plotly.js-dist-min` (or `react-plotly.js`) — Plotly figure rehydration
  - [ ] Client component that takes `results_json.figure_json` and calls `Plotly.newPlot`
  - [ ] Summary table (actual row + one per benchmark) with Δ vs actual columns
  - [ ] Replace the "Results rendering is part of Phase 4" placeholder in `src/app/dashboard/[id]/page.tsx`

## Next

- [ ] **Phase 5** — Delete-an-analysis UI on `/dashboard` so users can free a slot at the 5-cap. Today freeable only via SQL.
- [ ] **Phase 6** — Vercel deploy
  - [ ] Push branch to `origin/main`
  - [ ] `vercel link` against the real Vercel project + first `vercel deploy`
  - [ ] Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. **No** `SUPABASE_JWT_SECRET` needed in prod — the asymmetric JWT path fetches JWKS publicly. (Leave the env var slot empty; the handler tolerates it.)
  - [ ] Update Supabase Auth Redirect URLs with the prod domain
  - [ ] `maxDuration: 300` in `vercel.json` requires the Pro plan — confirm or downgrade to 60 s

## Later

- [ ] Port the CLI's `test_sanity.py` as a regression suite for `worker/` (XIRR zero-delta, withdrawal overflow, parser sanity)
- [ ] Stuck-`running` recovery — today only a >5min copy nudge; consider a daily cron / janitor that resets rows stuck in `running` for >10min back to `failed` with a generic error
- [ ] Drop the legacy HS256 branch from `api/analyze.py` once we're confident no project will ever issue HS256 user tokens again

## Blocked

_Nothing currently blocked._
