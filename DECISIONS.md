# Architectural decisions

ADR-style log. Append-only; do not rewrite past entries even if a decision is later reversed (add a new entry that supersedes the old one instead).

---

## 2026-05-12 — Local dev: stand-alone Python HTTP server instead of `vercel dev`

**Context.** Phase 3.5 introduces a Vercel Python serverless function at `api/analyze.py`. The canonical local way to exercise it is `vercel dev`, which requires `npm i -g vercel` (or `npx`), `vercel login` (browser-based device auth), and `vercel link` (interactive project setup). The user pushed back on this surface area for a session where we still haven't decided to deploy to Vercel.

**Decision.** Skip `vercel dev` for local development. Write a 20-line `scripts/dev_python_server.py` that imports the existing `handler` class from `api/analyze.py` and serves it via stdlib `ThreadingHTTPServer` on port 3001. Add a development-only rewrite in `next.config.ts` so the browser POSTs to `/api/analyze` (same origin as Next.js dev on :3000) and Next.js reverse-proxies to the Python server. Production keeps shipping to Vercel; `vercel.json` stays.

**Alternatives considered.**
- **`vercel dev`** — rejected as cited above. We'll come back to it (or directly to `vercel deploy`) in Phase 6.
- **Next.js Route Handler `child_process.spawn`ing Python** — rejected during initial Phase 3.5 planning (the Python binary won't be on the Vercel Node runtime image; works locally but not in prod).
- **Move the trigger into a Next.js Route Handler that calls the Python serverless** — adds an extra hop in prod for no benefit.

**Consequences.**
- Local dev requires **two terminals** (Python server + Next.js). Tolerable; common in fullstack projects.
- The dev-only rewrite is gated on `process.env.NODE_ENV === 'development'`. If a CI runs `next build` or `next start`, the rewrite goes away and `/api/analyze` would 404 — that's correct (CI shouldn't be hitting the function anyway).
- The `handler` class invocation path is byte-identical to what Vercel will do in prod (`do_POST(self)`), so this isn't a divergence in behavior — only in surrounding infrastructure (bundling, env injection, function isolation). Those parts get exercised the first time we run on Vercel.
- `vercel.json` and `requirements.txt` at root are still required for the Phase 6 deploy.

---

## 2026-05-12 — JWT verification: support both HS256 and asymmetric algs

**Context.** Phase 3.5 planning assumed Supabase user-session JWTs are signed HS256 with the project's "JWT Secret" (the shared symmetric secret visible in the dashboard at Project Settings → JWT). The handler was coded against that assumption. First end-to-end test failed: every browser POST got back `{"ok": false, "error": "invalid token: The specified alg value is not allowed"}`.

Cause: this Supabase project (created in 2026, on the modern auth setup) signs user-session JWTs with **ES256** using a keypair, not HS256 with the dashboard's "JWT Secret". The "JWT Secret" field still exists for legacy compat (legacy anon API keys are HS256-signed) but doesn't sign new user tokens. The public half of the signing key is at `<project>.supabase.co/auth/v1/.well-known/jwks.json`.

**Decision.** `_verify_supabase_jwt()` in `api/analyze.py` inspects the unverified JWT header's `alg` claim and routes:
- `HS256` → decode with `SUPABASE_JWT_SECRET` (legacy path; kept for projects still on the symmetric flow).
- `ES256` / `RS256` / `EdDSA` → fetch + cache the project's JWKS via `pyjwt.PyJWKClient`, look up the right key by `kid`, verify with the matching alg.
- Anything else → 401 with `unsupported JWT alg: ...`.

Audience is `"authenticated"` for both branches.

**Alternatives considered.**
- **Only support asymmetric (drop HS256).** Cleaner but couples us to this specific Supabase project's auth setup; if we ever spin up a new project that defaults to a different signing mode, we'd be stuck.
- **Rotate the Supabase project to HS256.** Possible via Supabase support but a meaningful blast-radius change to a working project for no real benefit — the handler change is small and the JWKS approach is the recommended modern path anyway.
- **Trust the JWT without signature verification, scope by the row's `user_id`.** Rejected — `api/analyze.py` runs with service_role, so an unverified caller could trigger compute against any row.

**Consequences.**
- One module-level HTTP fetch the first time a token is verified per process (JWKS download). Cached for the lifetime of the function instance (warm Vercel invocations skip it). ~1 KB response.
- `SUPABASE_JWT_SECRET` env var is now **optional** in prod for any project on the asymmetric flow. The handler tolerates its absence on the asymmetric branch.
- PyJWT's `cryptography` dependency (already pulled in transitively) handles ES256/RS256/EdDSA. No new top-level deps.
- If Supabase ever rotates the asymmetric key, the cached JWKS client picks up the new key on the next process. (PyJWKClient refetches when it sees an unknown `kid`.)

---

## 2026-05-12 — Results display: Plotly figure (chart only) + HTML summary table

**Context.** Phase 3 (math-only) inherited the CLI's `chart.py`, which built a 2-row Plotly subplot: a line chart on top, a `go.Table` trace with the metrics summary on the bottom. The CLI used this because it emitted a single self-contained HTML file. When Phase 4 added a results UI to the web app, two options existed for the metrics summary: keep using the Plotly-embedded table, or render it as native HTML in React.

**Decision.** **Split.** `worker/chart.py` returns a chart-only Plotly figure. The metrics summary lives in `src/app/dashboard/[id]/results-summary.tsx`, a server component that consumes `results_json.summary` and renders an HTML `<table>`. The worker's output contract (`results_json = { figure_json, summary: {...} }`) is unchanged — only the figure JSON is leaner.

**Alternatives considered.**
- **Keep the Plotly-embedded table.** First attempt; produced a duplicate table on the page (HTML one *and* Plotly one). Removing the HTML side instead of the Plotly side was tempting but rejected: Plotly tables don't respect the page's CSS theme, can't be made screen-reader friendly cheaply, don't sort, are styled imperatively in Python, and (in our `responsive: true` layout) get squeezed at narrow widths. The HTML version sits naturally in the page flow, themes correctly, and is a normal `<table>` for accessibility.
- **Server-render the chart as static SVG via `kaleido` / `plotly.io.to_image`.** Rejected — kills interactivity (hover, range slider, legend toggle), and image rendering on the Vercel Python serverless adds a heavy native dep.

**Consequences.**
- Worker chart height could drop from 900 → 600 px (no longer need to reserve 30% for the table subplot).
- Future formatting tweaks to the table happen in TSX/CSS, not in Python — faster iteration, theme-aware.
- The `figure_json` and `summary` fields of `results_json` must stay in lockstep with `src/lib/types.ts`. The frontend type and the worker's `_serialize_metrics` are the canonical sources; the worker's docstring + this entry are the documentation pointers.
- Frontends could in principle swap the chart for a different lib (Apache ECharts, Recharts) without touching the table — they're decoupled now.

---

## 2026-05-12 — Page layout: per-card max-width instead of a single page-level constraint

**Context.** All dashboard pages had `<main className="... max-w-3xl mx-auto">` constraining every child to 768 px. Fine for forms and metadata, terrible for the Phase 4 chart and 8-column metrics table — the chart squeezed, the table either wrapped or scrolled horizontally.

**Decision.** Move the max-width off `<main>` and onto each card individually. Outer `<main>` is `max-w-7xl mx-auto` (1280 px). Header, submission card, pending/running card, failed card, "no results" card, and the footer button row each carry `max-w-3xl mx-auto w-full`. Only the results card omits the `max-w-3xl` and spans the full 1280 px.

**Alternatives considered.**
- **Bump everything to `max-w-7xl`.** Simplest, but text-heavy cards (header, error message) feel stranded at 1280 px on wide displays.
- **Two stacked `<main>` regions** (narrow above, wide below). Semantically wrong (multiple `<main>` per page) and would require duplicating the page-padding / gap classes.
- **CSS container queries.** Would let cards self-size based on their own content — modern but adds complexity for a small win, and Tailwind v4 support for container queries is still maturing.

**Consequences.**
- Adding a new card on `/dashboard/[id]` now requires picking a width: `max-w-3xl` for text-shaped cards, `max-w-7xl` (or no max) for data-heavy ones. Both forms are demonstrated in the file; keep the pattern when adding new cards.
- The `<main>` no longer constrains children, so any new child without an explicit width will stretch to 1280 px — be deliberate.
- The dashboard list (`/dashboard/page.tsx`) is unchanged; it stays at `max-w-3xl` since each list row is a simple flex element.

---

## 2026-05-13 — Deploy on Vercel **Hobby** tier; downgrade `maxDuration` 300 → 60

**Context.** `vercel.json` was authored during Phase 3.5 with `maxDuration: 300` (Pro-tier ceiling), to give cold yfinance fetches plenty of headroom. Phase 6 forced a real choice between (a) subscribing to Vercel Pro ($20/mo) to keep 300s, or (b) the free Hobby tier capped at 60s per Python function invocation.

**Decision.** Hobby tier; downgrade `maxDuration` to 60 (commit `566054c`). Accept that cold first-runs on a long-history ticker may time out, with the user expected to retry — the second run benefits from the partial `benchmark_price_cache` warm-up from the first.

**Alternatives considered.**
- **Pro tier ($20/mo).** Removes the cap entirely. Rejected: nobody is paying $20/mo for what is currently a personal portfolio analyser used by 1 person. Always reversible if traffic ever grows.
- **Pre-warm the cache server-side via a cron** that yfinance-prefetches all common benchmarks daily. Possible but adds a scheduled job, monitoring, and ongoing compute cost. Defer to a future "fast cold start" effort if 60s becomes a regular pain point.
- **Move the worker off Vercel** to a long-running server (Fly.io, Railway, a tiny VM). Bigger architectural shift; defeats the simplicity of the all-in-one Vercel deploy.

**Consequences.**
- The 1024 MB memory setting in `vercel.json` stays — pandas + scipy + yfinance + plotly still OOM at 256 MB defaults. Memory is independent of maxDuration on Hobby tier.
- Worker fallback: on a 60s timeout, `worker.analyze.main` never reaches the writeback step, so the row stays in `running` indefinitely. The `AnalysisRunner` client component shows a >5min "still running" copy nudge — which now doubles as a "timed out, retry by deleting and re-submitting" nudge. The existing TODO entry for a janitor / auto-reset cron becomes more valuable once any real traffic shows up.
- Cold yfinance fetches that *do* complete in time still populate the benchmark cache; subsequent runs on the same ticker are seconds, not tens of seconds. So the timeout risk decays naturally with usage.
- If we later want to upgrade to Pro, the only file change is bumping `maxDuration` back. No code dependency on the limit.

---

## 2026-05-13 — Production SMTP: defer to Phase 7 (custom provider), not built-in Supabase

**Context.** Closing Phase 6 surfaced that Supabase's built-in SMTP service caps at ~2 emails/hour project-wide on the free tier. Confirmed via Supabase MCP `get_logs` → `error_code: over_email_send_rate_limit`, status 429. The forgot-password action ([src/app/auth/forgot-password/actions.ts](src/app/auth/forgot-password/actions.ts)) deliberately returns `{success: true}` regardless of SMTP outcome (to avoid leaking account existence), so rate-limited emails are silently dropped from the user's perspective.

**Decision.** Built-in SMTP stays for now (sufficient to test the prod deploy with). Custom SMTP becomes Phase 7 — required before any real traffic. Recommended provider: **Resend** (3000/mo, 100/day, free tier, no credit card, GitHub OAuth signup, single API key + 4 fields of Supabase Auth → SMTP Settings to wire up). Alternatives kept on the bench: AWS SES (cheapest at scale, more setup), Postmark (best deliverability), SendGrid, Mailgun.

**Alternatives considered.**
- **Subscribe to Supabase Pro** to raise the rate limit. Rejected: $25/mo and still caps emails (just higher). Doesn't solve the "we're dependent on Supabase's email infra forever" coupling.
- **Build our own SMTP via raw nodemailer / a custom Edge Function**. Rejected: zero upside vs. a dedicated provider, ops burden, deliverability risk (no sending reputation, likely lands in spam).
- **Skip transactional email entirely** by requiring users to confirm via something else (magic links via a different transport, OAuth-only signup). Bigger product change; not worth it for a hobby app.

**Consequences.**
- Phase 7 is "free" in dollars but requires user dashboard action (Resend signup + Supabase config). No code change in this repo.
- The forgot-password action's silent-on-failure behavior should arguably surface SMTP failures to *logs* even if not to the UI. Recorded as a follow-up in TODO.md → Phase 7 plan.
- Once on a real provider, deliverability becomes about domain reputation. Using `onboarding@resend.dev` (Resend's shared verified sender) works but lands in spam more often. Phase 7 should ideally pair with a verified custom domain.
- The Supabase MCP `get_logs` for the auth service was instrumental in diagnosing this — recording here so future debugging starts there for any auth-flow issue.

---

## 2026-05-23 — Password reset flow: `token_hash` + `verifyOtp` (verify-on-submit), not `?code=` exchange (verify-on-GET)

**Context.** User reported that clicking the "Reset Password" link in the email landed them on `/auth/login?error=auth_code_invalid` instead of the reset-password form. The URL hash carried `error_code=otp_expired`. The reset link was being burned **before** the user clicked it — Gmail's link scanner pre-fetches incoming URLs as a safety feature, which GET-requests Supabase's `/auth/v1/verify` endpoint, consumes the single-use recovery token, and leaves the real click hitting a spent token. This breaks password reset for every Gmail user (and likely for users on any other mail provider that pre-scans links — Outlook, ProtonMail, corporate scanners).

The old flow:

```
email link → Supabase /auth/v1/verify (GET) → /auth/callback?code=… → exchangeCodeForSession → /auth/reset-password
```

The vulnerability: the token is consumed by `/auth/v1/verify` on GET — and GETs are exactly what link pre-scanners issue.

**Decision.** Switch the recovery flow to the `token_hash` + `verifyOtp` pattern. The email link goes **directly** to `/auth/reset-password?token_hash=…&type=recovery` (bypassing Supabase's verify endpoint entirely). The page renders the new-password form without touching the token. `verifyOtp({ type: 'recovery', token_hash })` is called only inside the form-submit action — which means the token is consumed by an explicit user button-press, not by a passive GET. Pre-scanners don't press buttons.

**Implementation:**
- `src/app/auth/forgot-password/actions.ts` — `redirectTo` now points at `/auth/reset-password` directly (no `?next=` indirection through `/auth/callback`).
- `src/app/auth/reset-password/page.tsx` — converted to a server component reading `searchParams.token_hash` + `searchParams.type`, passing them to a child client form.
- `src/app/auth/reset-password/form.tsx` — new file; the client-side form, renders the token in hidden `<input>` fields, disables Submit if no token.
- `src/app/auth/reset-password/actions.ts` — server action reads `token_hash` from `FormData`, calls `verifyOtp` first (which sets the session cookie on success), then `updateUser({ password })`. Genuinely-expired tokens surface as a user-facing error in the form, not a redirect bounce.
- **Paired Supabase Dashboard change** — edit "Reset Password" email template: link target swapped from `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`. The template change is what causes the new emails to bypass Supabase's verify endpoint; without it, the new code does nothing useful.

**Alternatives considered.**
- **Make the email link send a 6-digit `{{ .Token }}` OTP code** that the user types into a form, instead of a link. Stronger phishing-resistance, but a worse UX (manual transcription) for a personal-portfolio app. Rejected.
- **Implement Supabase's PKCE flow.** PKCE moves the secret to the client and binds the code exchange to the originating session, which also defeats prefetch (the prefetcher's "session" can't redeem the code). Conceptually cleaner but more code changes (needs a client-side `code_verifier` round-trip), and the `verifyOtp` approach achieves the same end-state of "consume the token only on explicit user action" with less surface area. Rejected for scope.
- **Keep the old flow + tell Gmail users to whitelist sender / mark as safe to prevent pre-scanning.** Not actually possible — Gmail's link scanner runs regardless of sender reputation. Rejected (not feasible).
- **Tell the user to copy-paste the link into a fresh browser tab** (since pre-scanners don't actually navigate the user's browser). Fragile workaround, doesn't help anyone but power users, doesn't fix the bug. Rejected.

**Consequences.**
- **`/auth/callback/route.ts` is no longer used by password reset** — it's still in the code path for signup email confirmation, which has the *same* prefetch vulnerability (lower impact: pre-scanner GET silently auto-confirms the account rather than locking the user out). Logged as a TODO.md → Later item to apply the same pattern to signup.
- **The reset-password page is now a server component** with the form factored out — small structural change but worth noting if anyone tries to add state directly to the page in future. The form is at `src/app/auth/reset-password/form.tsx`.
- **The flow now requires the Supabase email template to be correct.** A future Supabase template reset (manual or via dashboard reset-to-default) would silently break recovery. Worth a future test_sanity-style check that hits `/auth/reset-password` without a token_hash and confirms the form's "missing token" error is shown — at least catches the symptom in CI.
- **Genuinely-expired tokens** (user waited >1hr to click) now surface as a clean in-form error message ("Reset link is invalid or has expired. Request a new password reset email.") instead of a redirect-bounce with hash-fragment error codes. Strictly better UX.
- **The `code` flow still works for any unmodified email template** — but only as an accident of `/auth/callback` still being mounted. We're not relying on it; new emails should never trigger it.
- **End-to-end verified in prod** 2026-05-23 by the user in an incognito Chrome window.

---

## 2026-05-23 — Apply the same `token_hash` + `verifyOtp` pattern to signup confirmation; delete `/auth/callback`

**Context.** The recovery flow ADR above noted in its Consequences that `/auth/callback` was still mounted because signup email confirmation also went through the `?code=` exchange. Same Gmail-prefetch vulnerability, but the user-facing impact was different: prefetcher GETs Supabase's verify endpoint, the account is silently auto-confirmed (because Supabase's verify endpoint sets a session cookie on the prefetcher's HTTP client and considers the email confirmed), and the user clicking the link sees the "invalid code" bounce to `/auth/login?error=auth_code_invalid`. The user can still log in because the account is in fact confirmed — just confusing UX rather than a hard block. Still worth fixing for code hygiene + consistency + closing the silent-auto-confirm gap.

**Decision.** Mirror the recovery fix one-for-one for signup:
- New `/auth/confirm` route (server `page.tsx` reading `searchParams`, client `form.tsx` with a single "Confirm email" button, server `actions.ts` calling `verifyOtp({ type: 'email', token_hash })` → `/dashboard`).
- `signupAction` — `emailRedirectTo` swapped from `${siteUrl}/auth/callback?next=/dashboard` to `${siteUrl}/auth/confirm`.
- **Paired Supabase Dashboard change** — "Confirm signup" email template link target: `{{ .ConfirmationURL }}` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
- **`/auth/callback/route.ts` deleted entirely** — no remaining caller in the app. Recovery bypasses it (since 2026-05-23 recovery fix), and signup now bypasses it too. Any old confirmation/recovery emails in inboxes from before this change will 404 on click — acceptable since the only known user (vinamrajain99@gmail.com) is already confirmed, and unconsumed recovery emails expire in ~1hr.

**Alternatives considered.**
- **Keep `/auth/callback` as a backward-compat fallback** — would prevent 404s on stale emails. Rejected for a single-user app: simpler to have only one valid code path. If we ever onboard real users, we can re-add it with a friendly "this link expired, please request a new one" page.
- **Make `/auth/confirm` auto-submit on mount instead of requiring a button press** — would smooth the UX (one fewer click). Rejected because it defeats the entire point of the fix: auto-submit on mount is exactly what prefetchers/crawlers exercise. The button press is load-bearing.
- **Verify on the page itself (server component) instead of in a separate action** — same problem. Prefetcher GETs the page → server component runs → token consumed. Has to be POST-only.

**Consequences.**
- **Two Supabase email templates are now load-bearing** — both "Reset Password" and "Confirm signup" must use the custom URLs. A dashboard template reset to defaults would silently break the corresponding flow. CLAUDE.md "Critical non-obvious decisions" calls this out; consider a future automated check (hit `/auth/confirm` with no token_hash, confirm the error UI shows) in CI to catch a silent template regression.
- **Stale signup emails 404 instead of working** — the prior `/auth/callback` URL no longer exists. Low impact for current usage; would warrant a redirect handler if/when traffic grows.
- **Supabase Auth → URL Configuration Redirect URLs** should add `/auth/confirm` (prod + localhost variants). `/auth/callback` entries can stay or be removed — removing is cleaner hygiene. README.md updated accordingly.
- **No code path now uses `exchangeCodeForSession`** in the entire app. If we ever add OAuth providers (Google sign-in, GitHub, etc.), we'll need to either re-create `/auth/callback` or use Supabase's PKCE flow directly. Worth remembering before adding social auth.
- **Pattern is now consistent** across auth flows — recovery, signup, and any future email-link flow (magic-link login, email change) should all use `token_hash` + `verifyOtp`.
