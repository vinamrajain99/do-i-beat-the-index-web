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
