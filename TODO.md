# TODO

## Now

_Nothing actively in flight — Phases 1–7 all shipped. See "Later" for the next layer of polish work._

## Later

- [ ] **Apply the token_hash / verifyOtp pattern to signup confirmation too.** Currently `/auth/callback/route.ts` still handles signup email confirmation via the `?code=` exchange — same Gmail-prefetch vulnerability as the old password-reset flow had. Impact is lower (a pre-scanner GET silently auto-confirms the account rather than locking the user out), but it's the same bug class. Fix: edit Supabase "Confirm signup" email template to use `{{ .TokenHash }}` and link to a small `/auth/confirm` page that calls `verifyOtp({ type: 'signup', token_hash })` on a button press, then drop the `code` branch of `/auth/callback`. Pairs with the recovery fix shipped 2026-05-23.
- [ ] **Add a Supabase keep-alive GitHub Actions workflow** so the project doesn't auto-pause every ~7 days on the free tier. Repo is public so GHA minutes are unlimited and free. Design: `.github/workflows/supabase-keepalive.yml`, runs on a weekly `schedule:` cron, makes one authenticated `curl` against a public REST endpoint (anon key in GitHub Actions secrets). External HTTP hits reliably reset the auto-pause clock; `pg_cron` was considered but internal DB activity may not count toward the pause detector. Context: hit this 2026-05-23 — project went `INACTIVE` after ~10 days idle, browser threw "fetch error" on login, fixed by `mcp__supabase__restore_project`. Will keep recurring until automated.
- [ ] **Set up a custom sender domain in Resend** for better deliverability — currently using `onboarding@resend.dev` (shared sender), emails are landing in spam on Gmail. ~5 min: add 3 DNS records (SPF, DKIM, DMARC) to a domain you own, verify in Resend, change the Sender email in Supabase Auth → SMTP Settings. Required before sharing the app with real users.
- [ ] Surface SMTP send failures to server logs (Supabase Auth logs / app logs), even though the forgot-password UI deliberately stays generic. Current behavior: any send failure (rate-limit, bounce, misconfig) is invisible. Should not affect the UX guarantee (no account-existence leak via UI) but adds ops visibility.
- [ ] Regenerate or delete the 3 pre-styling analyses created earlier this day (they still have the old "Robinhood actual vs. benchmark" title + verbose y-axis ticks). Cheapest fix: use the new Delete button and re-submit if you want them back.
- [ ] Port the CLI's `test_sanity.py` as a regression suite for `worker/` (XIRR zero-delta, withdrawal overflow, parser sanity).
- [ ] Stuck-`running` recovery — today only a >5min copy nudge on `/dashboard/[id]`; consider a daily cron / janitor that resets rows stuck in `running` for >10min back to `failed` with a generic error.
- [ ] Drop the legacy HS256 branch from `api/analyze.py` once we're confident no project will ever issue HS256 user tokens again.
- [ ] Upgrade the delete confirm UX from `window.confirm()` to a shadcn Dialog (requires adding the Dialog primitive — about 50 lines of handwritten code in `src/components/ui/`).
- [ ] Add per-benchmark colors in the HTML summary table matching the chart's line colors, so it's easier to map row ↔ line at a glance.

## Done (Phases 1 – 7)

- [x] **Phase 7** — Custom SMTP via Resend. Supabase Auth → SMTP Settings now points at `smtp.resend.com:587` with the Resend API key as the password. Sender = `onboarding@resend.dev` (shared sender — works, lands in spam on Gmail, fix is a custom domain — see Later). Removes the 2-emails/hour built-in cap; Resend free tier is 3000/mo, 100/day. Smoke test 2026-05-13 confirmed forgot-password email arrives + reset flow works end-to-end. Zero code changes — entirely Supabase + Resend dashboard config.
- [x] **Phase 6** — Vercel deploy. Live at `https://do-i-beat-the-index-web.vercel.app`. Env vars set on Vercel (`SUPABASE_SERVICE_ROLE_KEY` marked Sensitive; `SUPABASE_JWT_SECRET` left blank, asymmetric path uses JWKS). `vercel.json` `maxDuration` 300 → 60 for Hobby tier (commit `566054c`). Fixed initial build error: wrapped `/auth/login`'s `useSearchParams()` in a Suspense boundary (commit `99287e2`). Supabase Auth URL Configuration updated for prod redirects. Full E2E smoke test passed: signup → email confirm → submit analysis (SPY) → chart renders → delete (row + CSV) → password reset → login with new password.
- [x] **Phase 1** — Auth: sign up, log in, password reset, callback route, sign-out action. Supabase RLS + 5-row trigger + `csvs` storage bucket.
- [x] **Phase 2** — New-analysis form (`/dashboard/new`): name, current value, 1–5 benchmark chips, CSV upload. Server action inserts pending row + uploads CSV to `csvs/<uid>/<id>.csv`.
- [x] **Phase 3 (math-only)** — Python `worker/` package. Parses Robinhood CSV → computes XIRR/CAGR for actual → simulates each benchmark via deposit-mirrored sim with Postgres-cached yfinance prices → writes Plotly figure JSON + summary to `results_json`. CLI: `python -m worker.analyze <id>`.
- [x] **Phase 3.5** — HTTP wrapper (`api/analyze.py`) + client trigger/polling (`AnalysisRunner`). JWT verification handles HS256 *and* asymmetric ES256/RS256/EdDSA via JWKS. Local dev runs the Python handler standalone (no `vercel dev` required).
- [x] **Phase 4** — Results UI on `/dashboard/[id]`. Plotly chart (`PlotlyChart` client component, dynamic import of `plotly.js-dist-min`). HTML summary table (`ResultsSummary`) with rows for "Your portfolio" + each benchmark, Δ columns colored. Worker chart refresh: modern color palette, abbreviated y-axis ticks, white plot bg, subtle gridlines, bottom-center transparent legend.
- [x] **Phase 5** — Delete-an-analysis UI. `DeleteButton` (confirm + invoke) on each list row and on the detail page footer. `deleteAnalysisAction` server action: RLS-scoped row delete + best-effort CSV cleanup + `revalidatePath` + `redirect("/dashboard")`.

## Blocked

_Nothing currently blocked._
