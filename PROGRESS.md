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

## Session 2026-05-13 — Phase 6 (Vercel deploy)

**Shipped**

- **`vercel.json` `maxDuration` 300 → 60** (commit `566054c`). User chose the free Hobby tier over Pro; typical worker runs are well under 60s when the benchmark cache is warm. Cold first-runs on a long-history ticker might still hit the cap and need a retry, but that's an acceptable tradeoff for $0/mo. See DECISIONS.md (2026-05-13 — Vercel Hobby tier) for the full rationale.
- **Vercel project created**, GitHub-integration-based, production branch = `main`. Live at **https://do-i-beat-the-index-web.vercel.app**. Project name auto-derived from the repo name.
- **Production env vars set on Vercel**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy HS256-issued anon, matches local dev), `SUPABASE_SERVICE_ROLE_KEY` (marked **Sensitive**), `NEXT_PUBLIC_SITE_URL=https://do-i-beat-the-index-web.vercel.app`. `SUPABASE_JWT_SECRET` left blank — asymmetric JWT path uses JWKS, no shared secret needed.
- **First build failed**: `useSearchParams()` in [src/app/auth/login/page.tsx](src/app/auth/login/page.tsx) needed a Suspense boundary for static prerender (Next.js skips prerender in `next dev`, so this only surfaced on the prod build). **Fix** (commit `99287e2`): split the page into three components — `LoginPage` (Suspense wrapper with a fallback that defaults `next="/dashboard"`), `LoginFormWithSearchParams` (reads the `next` query param), and `LoginForm` (the pure form rendering). One-shot fix; redeployed cleanly.
- **Supabase Auth URL Configuration** updated: Site URL = prod URL. Redirect URLs now include both `localhost:3000` (for ongoing local dev) and prod variants for `/auth/callback` + `/auth/reset-password`. Discovered Supabase's exact-match allowlist still routes to `redirect_to` even when token validation fails — the error info is appended to the URL hash fragment (`#error=access_denied&error_code=otp_expired&...`), and our callback handles a missing `?code` by redirecting to `/auth/login?error=auth_code_invalid`. Hash survives that redirect, which is how we got the long ugly URL during early testing. Wildcard `…/auth/**` entries are unnecessary but added to TODO.md → Later as a hardening option.
- **Security audit** of the service_role key — checked all tracked files, git history (all branches), all `.md` files, and `NEXT_PUBLIC_*` prefixes. Key value never appeared in any commit on any branch and is not in any tracked file. Only the variable name is referenced (in 4 places: 2 code reads via `os.environ.get` + 2 docs/template mentions in CLAUDE.md). Confirmed `.gitignore` line 34 (`.env*`) excludes `.env.local`. Marked the var as Sensitive in Vercel.
- **Full E2E smoke test passed in prod**: signup → confirmation email (prod URL) → callback redirect to `/dashboard` → submit analysis (SPY benchmark) → status flipped Queued → Running → Completed within ~30s → chart + summary table rendered → delete from detail page → row gone, CSV gone from Supabase Storage. Then password reset flow: forgot-password → email arrived → reset-password page → new password set → auto-signed-in → manual logout and re-login with new password worked.

**Stumbles worth noting**

- **Email rate limit blocked initial smoke test.** Supabase's built-in SMTP allows ~2 emails/hour project-wide on the free tier. After multiple test-signup + forgot-password attempts during config debugging, hit `over_email_send_rate_limit` (429) silently. The forgot-password action ([src/app/auth/forgot-password/actions.ts](src/app/auth/forgot-password/actions.ts)) returns `{success: true}` regardless of SMTP outcome (a deliberate security choice to avoid account enumeration) — so the UI shows "Check your email" while emails are silently dropped. Diagnosed via Supabase MCP `get_logs` → auth service. Waited ~60min; window slid; flow worked. **Flagged as Phase 7 in TODO.md**: swap to Resend (or similar) custom SMTP. Build-in is unusable for real traffic.
- **Misdiagnosed the password-reset "redirects to homepage" symptom.** Initial theory: Supabase redirect URL allowlist rejecting query strings in `redirect_to` and falling back to Site URL. After getting the actual URL the user landed on, the truth was different: Supabase did route to our callback correctly; the token was just expired (single-use, already burned by earlier click). The hash fragment from Supabase's verify endpoint preserves through the callback's redirect to `/auth/login`. Lesson recorded inline in PROGRESS — Supabase's allowlist matching is more permissive than I assumed; exact-match entries do accept appended query strings.
- **Harness blocked direct pushes to `main` repeatedly.** Even with the user's general assent to "do this yourself," each push to `origin/main` required a fresh, explicit per-push authorization from the user this session. Pattern: I commit + push as a single command; the harness denies; user types "yes, commit and push to origin/main"; second attempt succeeds. Recorded so future sessions know not to expect blanket authorization for default-branch pushes.

**In progress**

- _Nothing._ Phase 6 fully shipped, end-to-end verified in prod, all changes on `origin/main` through commit `99287e2`.

**Blocked**

- _Nothing currently blocked._

**Next session should pick up**

**Phase 7 — Custom SMTP** (Resend or equivalent). Required to make the app usable for any real traffic — current built-in SMTP throttles at 2 emails/hour project-wide. No code changes needed; the work is entirely in the Resend dashboard + Supabase Auth → SMTP Settings. Full breakdown in TODO.md → Now.

## Session 2026-05-13 (cont.) — Phase 7 (Custom SMTP via Resend)

**Shipped**

- **Resend account created** via GitHub OAuth (`vinamrajain99`), free tier (3000/mo, 100/day, no credit card).
- **API key created** in Resend with **Sending access** scope only (not Full access — Supabase doesn't need read/management permissions). Key starts `re_...`, stored only in Supabase Auth → SMTP Settings password field.
- **Supabase Auth → SMTP Settings** wired to Resend: Host `smtp.resend.com`, Port `587`, Username `resend`, Password = Resend API key, Sender email `onboarding@resend.dev` (Resend's shared sender), Sender name "Do I beat the index?". Custom SMTP toggle enabled.
- **Smoke test passed end-to-end in prod**: forgot-password from incognito → "Check your email" → email arrived in **spam folder** within ~30s → reset link works → new password set → login with new password works. The 2-emails/hour built-in cap is gone (Resend ceiling is 100/day, ~50× headroom for any realistic traffic).
- **Tracking files updated for both Phase 6 and Phase 7 closure**:
  - [TODO.md](TODO.md) — "Now" emptied (all phases shipped); Phase 7 moved to Done; custom-sender-domain + SMTP-failure-logging surfaced as new "Later" entries
  - [README.md](README.md) — status banner now reflects Phases 1–7; roadmap checkboxes updated
  - [DECISIONS.md](DECISIONS.md) — captured the Hobby-tier maxDuration tradeoff and the deferred-to-Phase-7 SMTP decision during the earlier mid-session /save-progress
  - [PROGRESS.md](PROGRESS.md) — this entry

**Stumbles worth noting**

- **SMTP Settings location moved in Supabase UI.** First instruction set sent the user to "Project Settings → Authentication → SMTP Settings"; they couldn't find it. The current location appears to be reachable via several paths (Authentication sub-pages or the main Auth settings page). User found it on their own after I gave alternate paths to try; future sessions should expect this UI to keep shifting.
- **No "Send test email" button** in the Supabase SMTP UI version on this project. Tested via real forgot-password instead.

**In progress**

- _Nothing._ Phases 1–7 all shipped. The app is fully deployed, email-capable, and usable for any real-traffic load that doesn't exceed Resend's 100/day cap.

**Blocked**

- _Nothing._

**Next session should pick up**

No active phase. The build is fundamentally done. When ready for polish, the natural next item is **custom-sender-domain DNS setup** in Resend (5 min of DNS work — SPF, DKIM, DMARC records added to a domain you own). This removes the spam-folder hit from the current `onboarding@resend.dev` shared sender and is the only remaining gap before sharing the app with real users. Other low-priority items in TODO.md → Later (test_sanity port, stuck-running cron, delete-confirm Dialog, etc.) can be picked in any order.

## Session 2026-05-23 — Supabase auto-pause + Gmail-prefetch reset bug

**Shipped**

- **Diagnosed and unblocked login.** User reported "fetch error" on signin. Root cause: Supabase free tier auto-pauses projects after ~7 days of inactivity, and this project (last activity 2026-05-13) had gone `INACTIVE`. Restored via `mcp__supabase__restore_project` — flipped INACTIVE → COMING_UP → ACTIVE_HEALTHY in ~60s. Login worked again immediately after.
- **Fixed Gmail-prefetch password reset bug** (commit `2556699`). The forgot-password flow was broken for all Gmail users: Gmail's link scanner pre-fetches links in incoming mail for safety, which GET-requests Supabase's `/auth/v1/verify` endpoint and consumes the single-use recovery token *before the user can click*. Every reset attempt landed at `/auth/login?error=auth_code_invalid#error_code=otp_expired`.
  - **Architectural switch**: from `?code=` exchange (verify-on-GET, prefetch-vulnerable) to `token_hash` + `verifyOtp` (verify-on-form-submit, prefetch-immune). See DECISIONS.md (2026-05-23) for the full rationale.
  - **Files changed**:
    - `src/app/auth/forgot-password/actions.ts` — `redirectTo` now points directly at `/auth/reset-password` (no callback hop)
    - `src/app/auth/reset-password/page.tsx` — converted from client component to server component, reads `token_hash` + `type` from `searchParams`, passes to a child form component
    - `src/app/auth/reset-password/form.tsx` — **new file**; the client-side form, takes `tokenHash` + `type` as props, renders as hidden form fields, disables submit if no token
    - `src/app/auth/reset-password/actions.ts` — reads `token_hash` from formData, calls `verifyOtp({ type, token_hash })` first (which consumes the token + sets the session), then `updateUser({ password })`. Genuinely-expired tokens surface as a clean error message in the form.
  - **Paired Supabase Dashboard change** (user did this manually): edited "Reset Password" email template. Link target swapped from `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`.
  - **End-to-end verified in prod** by the user in an incognito window: forgot-password → email arrives → click link → lands on `/auth/reset-password` (no bounce) → set new password → auto-signed-in → `/dashboard`. Login with the new password also worked.
- **Bookkeeping updates**:
  - **CLAUDE.md** line 7: "(private during build-out)" → "(public)" — repo went public at some point between Phase 7 close and today.
  - **TODO.md → Later**: added the Supabase keep-alive GHA workflow (with full design rationale + 2026-05-23 incident context) and the signup-callback follow-up (`/auth/callback` still uses the prefetch-vulnerable `code` flow for signup confirmation — lower impact since pre-scanner GET silently auto-confirms rather than locking the user out, but same bug class).

**Stumbles worth noting**

- **First broader-repo lint OOM'd** trying to parse leftover `.venv/` directories under `.claude/worktrees/{focused-bhaskara,great-lumiere,sad-ptolemy}-*` from earlier worktree-based sessions. ESLint hit a `RangeError: Invalid string length` in the stylish formatter on plotly's `widgetbundle.js`. Targeted lint on just the changed files was clean. Pre-existing problem worth fixing later by either adding `.claude/`, `.venv/` to ESLint ignore or `rm -rf .claude/worktrees/*` if those branches are abandoned. Not blocking — `tsc --noEmit` passed, targeted lint passed, prod build succeeded.
- **Initial diagnosis instinct was the same as the misdiagnosis recorded in PROGRESS.md (2026-05-13)** — "redirect URL allowlist" theory. The hash fragment in the URL the user pasted (`#error_code=otp_expired`) was the deciding evidence that this was prefetch-burning the token, not allowlist failure. Worth remembering: the URL hash is where Supabase puts the actionable error info.
- **Admin password reset via Supabase Dashboard was the original "fast unblock" plan** — but the UI in the project's Auth → Users view didn't expose an "Edit user / Reset password" affordance. Skipped that path and went straight to the code fix; user's password was reset through the fixed flow at the end.

**In progress**

- _Nothing._ The fix is shipped, deployed (commit `2556699` on `origin/main`), template updated in Supabase Dashboard, end-to-end verified in prod.

**Blocked**

- _Nothing currently blocked._

**Next session should pick up**

The highest-value next item is the **Supabase keep-alive GitHub Actions workflow** (TODO.md → Later, first entry). It's ~20 lines of YAML + 1 GHA secret, prevents today's "project auto-paused → fetch error on login" from recurring, and the repo being public means GHA minutes are unlimited and free. Estimate: 15–30 min including a test run.

After that, the **signup-callback follow-up** (TODO.md → Later, second entry) is the next natural code change — applies today's `token_hash` + `verifyOtp` pattern to the signup confirmation flow, which has the same prefetch vulnerability. Lower urgency (silent auto-confirm rather than locked-out user), but cleanest while the pattern is fresh.

## Session 2026-05-24 — Signup-confirmation follow-up + Resend sandbox discovery

**Shipped**

- **Signup confirmation flow rewritten** (commit `f8f599e`, pushed to `origin/main`). Mirrors the 2026-05-23 recovery fix one-for-one:
  - New `/auth/confirm` route: `page.tsx` (server, reads `searchParams.token_hash` + `searchParams.type`), `form.tsx` (client, single "Confirm email" button, disables on missing token), `actions.ts` (calls `verifyOtp({ type: 'email', token_hash })` then `redirect("/dashboard")`).
  - `src/app/auth/signup/actions.ts` — `emailRedirectTo` swapped from `${siteUrl}/auth/callback?next=/dashboard` to `${siteUrl}/auth/confirm`.
  - **`src/app/auth/callback/route.ts` deleted entirely.** No remaining caller — recovery bypassed it 2026-05-23, signup now bypasses it. Stale unconfirmed signup emails from before today will 404 on click; acceptable for current usage (single known user, already confirmed).
- **Supabase Dashboard changes** (user did manually, paired with the code deploy):
  - "Confirm signup" email template link target: `{{ .ConfirmationURL }}` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
  - Auth → URL Configuration → Redirect URLs: added `https://do-i-beat-the-index-web.vercel.app/auth/confirm` + `http://localhost:3000/auth/confirm`. `/auth/callback` entries left as-is for now (harmless dead allowlist entries).
- **DECISIONS.md ADR added** ("2026-05-23 — Apply the same `token_hash` + `verifyOtp` pattern to signup confirmation; delete `/auth/callback`"). Notes the two-template dependency, why `/auth/confirm` can't auto-submit on mount (would defeat the entire fix), and the gotcha that `exchangeCodeForSession` is no longer used anywhere — if/when OAuth providers are added, a fresh `/auth/callback` (or Supabase's PKCE flow) will be needed.
- **CLAUDE.md + README.md + TODO.md** updated for the route move (file map, auth setup instructions, TODO item closed).
- **Two prior commits pushed to `origin/main`**: `13e59a9` (yesterday's docs `/save-progress`) and `f8f599e` (today's signup fix).

**In progress / partial**

- **Signup-confirmation flow is shipped + deployed but NOT live-verified end-to-end.** Attempted live verification using a Gmail `+confirm-test` alias trick (Gmail same-inbox, Supabase fresh-user). Failed: Resend rejected the send with `550 You can only send testing emails to your own email address (vinamrajain99@gmail.com)`. User opted to skip the live test rather than burn the existing account or rush a custom-domain setup. The code change is byte-for-byte parallel to the working recovery flow (which IS live-verified), so confidence is high but not 100%. Will be naturally verified on the next real signup once a custom Resend domain is configured.

**Stumbles worth noting**

- **The Gmail `+alias` trick does not bypass Resend's sandbox.** Gmail routes `foo+bar@gmail.com` to `foo@gmail.com`, but Resend evaluates the literal recipient string against its allowlist. The Supabase auth log was decisive — `mcp__supabase__get_logs` returned the SMTP-level 550 with the exact error string. Reminder: for any auth flow misbehavior, check `auth` logs first — that's two sessions running where the smoking gun was in there.
- **Two orphan users left in `auth.users`** from the failed signup attempts (both `vinamrajain99+confirm-test@gmail.com`, no confirmation, no password persisted on confirmation path). Harmless until someone tries the same alias again; logged as a cleanup TODO.
- **Resend sandbox restriction was a known unknown that became a known known.** TODO.md → Later had a "custom Resend domain" entry framed as "deliverability / lands in spam." Today escalated it: it's not just spam, it's outright SMTP rejection for any non-owner recipient. Updated the TODO entry with the harder framing.

**Blocked**

- **Live verification of the signup-confirm flow** — blocked on Resend custom domain setup OR on a destructive delete-and-resign of `vinamrajain99@gmail.com`. Captured in TODO.md → Blocked.

**Next session should pick up**

The Resend custom-domain item is now the single highest-leverage thing on the list — it (a) unblocks live verification of the just-shipped signup flow, (b) takes the app from "personal use only" to "shareable," and (c) gets emails out of spam folders. ~10 min if you already own a domain with DNS access. The Supabase keep-alive GHA workflow is still the runner-up if you want code-only work that doesn't depend on external setup.

## Session 2026-05-24 (cont.) — Results page UI polish

**Shipped**

- **Plotly chart modebar trimmed** (commit `440f8c6`). [`src/app/dashboard/[id]/plotly-chart.tsx`](src/app/dashboard/[id]/plotly-chart.tsx) now passes `modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "resetScale2d"]` and a `modeBarButtonsToAdd` entry for a custom **Reset** button (`Plotly.Icons.home`, click handler `relayout({ "xaxis.autorange": true, "yaxis.autorange": true })`). Lasso/box select had no consumer (no `plotly_selected` listener, no linked view); `autoScale2d` was redundant with `resetScale2d` because `worker/chart.py` sets no explicit axis ranges; native "Reset axes" tooltip got renamed to just "Reset". Net modebar: download PNG, zoom, pan, zoom in, zoom out, Reset, hover toggles.
- **Top-of-page "Submission" card replaced with two side-by-side overview cards** (commit `ff89376`). [`src/app/dashboard/[id]/page.tsx`](src/app/dashboard/[id]/page.tsx) now renders a `<section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl ... items-start">` containing:
  - **Cash flow** card — 2×2 grid of tiles: `TOTAL DEPOSITED` / `DEPOSITS` (count) on top row, `TOTAL WITHDRAWN` / `WITHDRAWALS` (count) on bottom row.
  - **Current value** card — 2-col grid with `YOUR PORTFOLIO` (user-typed `current_value_usd`, always present) plus one tile per benchmark showing `summary.benchmarks[ticker].final_value`.
- **New helpers, all inline in `page.tsx`**:
  - `fmtUsd(n)` and `fmtCount(n)` — format with `—` fallback for null/undefined/non-finite.
  - `StatTile({ label, value, loading? })` — uppercase tracking-wider muted label (`text-[0.7rem]`) over a `text-lg font-semibold tabular-nums` value. Accepts pre-formatted string for flexibility.
  - `LoadingDots()` — three `h-2 w-2` muted dots using Tailwind's `animate-pulse` with arbitrary `[animation-delay:0/200/400ms]` for a staggered wave; carries `role="status" aria-label="Loading"`.
- **Loading-state UX rule** (also in `ff89376`): `StatTile` shows `<LoadingDots />` only when `loading && value === "—"`. `isLoading = status === "pending" || status === "running"`. Failed analyses fall back to static em-dashes — nothing's coming, no pulsing UI lie. "Your portfolio" tile keeps its dollar value pre-results because the value isn't `"—"`.
- **Layout-stability guarantee**: same DOM shape pre and post results. Values just swap in, no card resize or content shift when the worker completes.
- **CLAUDE.md trimmed for the rename**: file map line for `[id]/page.tsx` updated (`submission` → `overview`); per-card-max-width note now describes the new section/inner-card structure.
- **Local dev env restored**: main repo's `.env.local` was missing (only existed in `.claude/worktrees/sad-ptolemy-e0dd0e/`). Copied the worktree's `.env.local` (1235 B, Phase-3.5 shape with HS256 `SUPABASE_JWT_SECRET` populated — harmless, the asymmetric path is what `api/analyze.py` uses) to repo root. `NEXT_PUBLIC_SITE_URL` already `http://localhost:3000`. Documented in CLAUDE.md's "Worktrees do NOT share gitignored files" gotcha — same root cause applies to the repo root itself if `.env.local` was never created there.

**Stumbles worth noting**

- **Initial Phase 3.5–era discussion about labels**: settled on `Deposits` / `Withdrawals` (short) for the count tiles, distinguishing them from `Total deposited` / `Total withdrawn` (dollar amounts) by both label wording and the integer-vs-currency value formatting. Felt clean in practice.
- **`/dashboard` 404'd with "Your project's URL and Key are required to create a Supabase client!"** after `npm run dev` — diagnosed in ~30s as missing `.env.local` rather than a broken proxy. The error correctly bubbled from `src/lib/supabase/proxy.ts:14` (createServerClient with `process.env.NEXT_PUBLIC_SUPABASE_URL!`). Worth remembering: Next.js loads env files only at process start; restart after editing.

**In progress**

- _Nothing._ Both commits pushed? No — local `main` is ahead of `origin/main` by 2 commits (`440f8c6` chart fix, `ff89376` overview cards). Push wasn't requested this session.

**Blocked**

- _Same as the prior 2026-05-24 entry_ — Resend custom-domain setup still blocks live signup-confirmation verification and any non-owner email recipient.

**Next session should pick up**

1. **Push the two new commits to `origin/main`** if not already done — Vercel auto-deploys from `main`, so the UI improvements aren't live until pushed. `git push origin main`.
2. **Resend custom-domain setup** remains the top-of-list polish item (carrying over from prior session). ~10 min DNS work.
3. After deploy, eyeball the overview cards on Vercel prod with real screen widths to confirm the side-by-side layout reads well on common mobile viewport sizes.

## Session 2026-05-24 (cont. 2) — README rewrite + landing-page redesign

**Shipped**

- **README rewritten to stand alone** (commit `2e322cb`, pushed earlier in this session as `55d1aeb` for the banner-only first pass, then the full rewrite as `2e322cb`). [`README.md`](README.md) no longer references the CLI repo; the "Web app version of [do-i-beat-the-index]" framing is gone. New sections (ported + adapted from the CLI's README, with light edits): **Why this exists**, **What it does**, **How the math works (and why)** (sub-sections What gets mirrored / Why this is an honest DRIP comparison / Why individual buys aren't mirrored / Money-weighted return), **Usage** (4-step end-user flow: download CSV from Robinhood web, note current portfolio value, submit, read the report), **Privacy and data** (web-specific — Supabase Storage RLS, Yahoo Finance for prices only, shared Postgres price cache). Architecture / Local development / Project structure / Security notes / Roadmap / License preserved.
- **All author-voice first-person stripped from the README**: "I've been susceptible" → "Many individual retail investors are susceptible"; "we mirror" / "We get that for free" / "when we say" → passive constructions ("What gets mirrored" / "This comes for free from using" / "when the simulation computes"); "did my picking beat indexing the same money I put in?" → "did your picking beat indexing the same money you put in?"; etc. Only first-person remaining is the title `# Do I beat the index?` — kept as the user's question to themselves.
- **Landing page (`/`) fully redesigned** (commit `511bb1b`). [`src/app/page.tsx`](src/app/page.tsx) changes:
  - **Title**: "Am I wasting my time and money by stock-picking?" → `Do you actually beat a simple <em>Buy Index</em> strategy?` with "Buy Index" rendered in italic via `<em>`.
  - **Subtitle reworded twice** through user iteration; final text: "Compare how your investment picks have done vs index investing. Same money in/out, same cadence, accurate comparison. No broker login."
  - **Eyebrow line now inline with GitHub link**: "FOR ROBINHOOD USERS · OPEN SOURCE ON GITHUB" (middle-dot separator matching the convention in `results-summary.tsx`'s metadata strip). The GitHub URL was wrong (pointed at `vinamrajain99/do-i-beat-the-index`, the now-disowned CLI repo); fixed to `vinamrajain99/do-i-beat-the-index-web`.
  - **"How it works" rebuilt as 3 numbered steps** with shadcn-themed dark filled-circle badges (`bg-primary text-primary-foreground`, `h-7 w-7 rounded-full`), left-aligned text under a centered "HOW IT WORKS" eyebrow. Step 1 explicitly tells users to download the *full* Robinhood activity report (Account → Reports & Statements → Activity report) including all transactions from their very first one — incomplete history would skew XIRR/CAGR. Steps 2 and 3 cover upload+benchmarks+portfolio-value and the chart+table output respectively.
  - **Hero spacing**: bumped from `space-y-3` (12 px) to `space-y-6` (24 px) on the eyebrow/title/subtitle stack — visually cramped before.
  - **Dropped the old "Up to 5 saved analyses per account. Open source on GitHub." line** under the buttons; the open-source link now lives in the eyebrow instead.
- **README polish commits earlier in the session**:
  - `55d1aeb` (already pushed at the time of the prior /save-progress) — replaced the marketing-toned banner with a plain live URL + a callout noting signups are paused while custom-domain email is pending; reworded the Phase 7 roadmap line to match; added `src/lib/types.ts` to the file map.

**Stumbles worth noting**

- **CLI README path**: the path in CLAUDE.md (`/Users/aayushipandit/Desktop/Claude-Work/Robinhood portfolio analyser/`) was stale — the actual directory is `/Users/aayushipandit/Desktop/Claude-Work/do-i-beat-the-index`. Caught immediately by listing the parent dir. Worth a small CLAUDE.md fix on a future pass if the path is still wanted (it's only used as a reference pointer; nothing depends on it at build time).
- **Section title "What we mirror" was missed in the first first-person sweep** — slipped through the initial grep because it's at a heading level. Caught on the final sweep and renamed to "What gets mirrored".
- **The title "Do I beat the index?" was a deliberate carve-out** from the "no first-person" pass — it's read as the user's question to themselves (quiz-title voice), not author voice. Flagged to the user explicitly; they didn't ask to change it.
- **Many copy iterations** on the landing page subtitle ("honest" → "accurate", removed "simple", removed "easily", removed "needed", removed "for accurate calculations"). User clearly has a strong voice and wants tight, deliberate copy — worth preserving exact phrasing on future copy work.

**In progress**

- _Nothing._ Two commits sit on local `main` ahead of `origin/main` (`2e322cb` README rewrite, `511bb1b` landing redesign), not pushed in this session — user has not yet asked. The earlier `55d1aeb` banner-only commit IS already on `origin/main` from the previous /save-progress's push.

**Blocked**

- _Same as prior 2026-05-24 entries_ — Resend custom-domain setup still blocks live signup-confirmation verification and any non-owner email recipient.

**Next session should pick up**

1. **Push the two new commits to `origin/main`** (`git push origin main`) so the README rewrite and landing-page redesign go live on Vercel. The landing page is the first thing any visitor sees on the deployed URL.
2. **Resend custom-domain setup** remains the top-of-list polish item — carrying over from multiple prior sessions.
3. Once pushed, eyeball the landing page on Vercel prod across desktop + mobile widths. The numbered-steps layout is new; worth confirming the step-number circles align well with the first line of step text on small screens.
