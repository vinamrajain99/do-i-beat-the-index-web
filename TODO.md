# TODO

## Now

- [ ] **Phase 6** — Vercel deploy
  - [ ] Create a Vercel project (web UI is fine — no CLI needed if using GitHub integration)
  - [ ] Connect this GitHub repo (`vinamrajain99/do-i-beat-the-index-web`); set production branch = `main`
  - [ ] Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (= the Vercel prod URL). Leave `SUPABASE_JWT_SECRET` empty — asymmetric JWT path fetches JWKS publicly.
  - [ ] Update Supabase Dashboard → Auth → URL Configuration: add prod URL to **Site URL** and add `<prod>/auth/callback` + `<prod>/auth/reset-password` to **Redirect URLs**.
  - [ ] `maxDuration: 300` in `vercel.json` requires the Pro plan — confirm subscription or downgrade to `60` (typical worker run is well under 60 s when cache is warm).
  - [ ] Verify: sign up → submit analysis → chart renders, delete works.

## Later

- [ ] Regenerate or delete the 3 pre-styling analyses created earlier this day (they still have the old "Robinhood actual vs. benchmark" title + verbose y-axis ticks). Cheapest fix: use the new Delete button and re-submit if you want them back.
- [ ] Port the CLI's `test_sanity.py` as a regression suite for `worker/` (XIRR zero-delta, withdrawal overflow, parser sanity).
- [ ] Stuck-`running` recovery — today only a >5min copy nudge on `/dashboard/[id]`; consider a daily cron / janitor that resets rows stuck in `running` for >10min back to `failed` with a generic error.
- [ ] Drop the legacy HS256 branch from `api/analyze.py` once we're confident no project will ever issue HS256 user tokens again.
- [ ] Upgrade the delete confirm UX from `window.confirm()` to a shadcn Dialog (requires adding the Dialog primitive — about 50 lines of handwritten code in `src/components/ui/`).
- [ ] Add per-benchmark colors in the HTML summary table matching the chart's line colors, so it's easier to map row ↔ line at a glance.

## Done (Phases 1 – 5)

- [x] **Phase 1** — Auth: sign up, log in, password reset, callback route, sign-out action. Supabase RLS + 5-row trigger + `csvs` storage bucket.
- [x] **Phase 2** — New-analysis form (`/dashboard/new`): name, current value, 1–5 benchmark chips, CSV upload. Server action inserts pending row + uploads CSV to `csvs/<uid>/<id>.csv`.
- [x] **Phase 3 (math-only)** — Python `worker/` package. Parses Robinhood CSV → computes XIRR/CAGR for actual → simulates each benchmark via deposit-mirrored sim with Postgres-cached yfinance prices → writes Plotly figure JSON + summary to `results_json`. CLI: `python -m worker.analyze <id>`.
- [x] **Phase 3.5** — HTTP wrapper (`api/analyze.py`) + client trigger/polling (`AnalysisRunner`). JWT verification handles HS256 *and* asymmetric ES256/RS256/EdDSA via JWKS. Local dev runs the Python handler standalone (no `vercel dev` required).
- [x] **Phase 4** — Results UI on `/dashboard/[id]`. Plotly chart (`PlotlyChart` client component, dynamic import of `plotly.js-dist-min`). HTML summary table (`ResultsSummary`) with rows for "Your portfolio" + each benchmark, Δ columns colored. Worker chart refresh: modern color palette, abbreviated y-axis ticks, white plot bg, subtle gridlines, bottom-center transparent legend.
- [x] **Phase 5** — Delete-an-analysis UI. `DeleteButton` (confirm + invoke) on each list row and on the detail page footer. `deleteAnalysisAction` server action: RLS-scoped row delete + best-effort CSV cleanup + `revalidatePath` + `redirect("/dashboard")`.

## Blocked

_Nothing currently blocked._
