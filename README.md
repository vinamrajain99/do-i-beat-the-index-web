# do-i-beat-the-index-web

Web app version of [do-i-beat-the-index](https://github.com/vinamrajain99/do-i-beat-the-index) — the same deposit-mirrored portfolio-vs-benchmark analysis, but with login, persistent saved analyses, and a browser UI.

**Live at https://do-i-beat-the-index-web.vercel.app** (Vercel Hobby tier). Phases 1 – 7 shipped. Transactional emails go through Resend (shared `onboarding@resend.dev` sender for now; custom-domain DNS setup is the only remaining polish step before sharing with real users).

## Architecture

- **Frontend**: Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui, deployed on **Vercel**
- **Backend compute**: Python serverless functions in the same Vercel deployment (reuses the CLI's tested math)
- **Auth + DB + Storage**: **Supabase**
  - Auth: email/password with email confirmation and password-reset links
  - Postgres: `analyses` table (max 5 per user, enforced by trigger + RLS)
  - Storage: private `csvs/` bucket, per-user folder isolation

## Local development

### 1. Create a Supabase project

[supabase.com](https://supabase.com) → New project. Save the database password somewhere safe.

Once it's up, go to **Project Settings → API** and copy the credentials below into a new `.env.local` file in this directory (start from `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional. Only needed if your project signs user sessions with HS256.
# Modern Supabase projects use asymmetric (ES256) signing keys, in which
# case `api/analyze.py` fetches the public key from the project's
# .well-known/jwks.json automatically — leave this blank.
# Find under Project Settings → JWT Keys / JWT Secret if you do need it.
SUPABASE_JWT_SECRET=
```

### 2. Apply the database schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of `supabase/migrations/20260510000000_init_schema.sql`, and click **Run**. This creates the `analyses` table, RLS policies, the 5-analysis-per-user trigger, the `csvs` storage bucket, and the benchmark price cache table.

### 3. Configure Supabase Auth

In the Supabase dashboard:

- **Auth → URL Configuration**: set **Site URL** to `http://localhost:3000` (later: your Vercel URL). Add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/reset-password` to **Redirect URLs**.
- **Auth → Providers → Email**: enable, and turn on "Confirm email" (default).

### 4. Install npm deps

```bash
npm install
```

### 5. Python venv for the analysis worker

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

### 6. Run the dev servers (two terminals)

The analysis worker runs as a Vercel Python serverless function (`api/analyze.py`).
For local development, we run it as a stand-alone HTTP server via stdlib
`ThreadingHTTPServer` — Next.js proxies `/api/analyze` to it through a
dev-only rewrite. This avoids requiring the Vercel CLI for local testing.

**Terminal A** — Python handler on `:3001`:

```bash
.venv/bin/python scripts/dev_python_server.py
```

**Terminal B** — Next.js on `:3000`:

```bash
npm run dev
```

App is at [http://localhost:3000](http://localhost:3000). Submitting an
analysis from the UI POSTs through to the Python server, which calls into
`worker.analyze.main()`, computes XIRR/CAGR + benchmark simulations, and
writes `results_json` back. The UI polls every 3 seconds until the row
flips to `completed` or `failed`.

If only the UI changes, you don't need Terminal A. If `api/analyze.py` or
anything under `worker/` changes, Ctrl-C and restart Terminal A —
`BaseHTTPRequestHandler` doesn't hot-reload.

### 7. (Optional) Invoke the worker directly from the CLI

Useful for debugging math without the HTTP layer in the way:

```bash
.venv/bin/python -m worker.analyze <analysis_id>
```

The worker reads `.env.local` for the Supabase URL + service role key and
caches benchmark prices in the `benchmark_price_cache` table (one yfinance
fetch per ticker per day). It's idempotent — running it on an already-
completed row is a clean no-op.

## Project structure

```
src/
├── app/
│   ├── layout.tsx               root layout, fonts, Toaster
│   ├── page.tsx                 landing page (redirects to /dashboard if signed in)
│   ├── auth/
│   │   ├── layout.tsx           centered card layout for all auth pages
│   │   ├── login/               page + server action
│   │   ├── signup/              page + server action (sends confirmation email)
│   │   ├── forgot-password/     page + server action (sends reset email)
│   │   ├── reset-password/      server page (reads token_hash) + form.tsx (client) + actions.ts (verifyOtp + updateUser)
│   │   ├── callback/route.ts    exchanges email-link code for session (signup confirmation)
│   │   └── sign-out/actions.ts  server action used by Sign out button
│   └── dashboard/
│       ├── page.tsx             list of analyses (max 5) + "+ New analysis" + per-row Delete
│       ├── actions.ts           deleteAnalysisAction (row + CSV cleanup + redirect)
│       ├── delete-button.tsx    client: confirm + invoke delete action
│       ├── new/
│       │   ├── page.tsx         form: name, value, benchmark chips, CSV upload
│       │   └── actions.ts       server action: validate, insert, upload, redirect
│       └── [id]/
│           ├── page.tsx         server: header, submission card, status-keyed body
│           ├── analysis-runner.tsx  client: POST /api/analyze + 3s polling
│           ├── plotly-chart.tsx     client: dynamic-imported Plotly.newPlot
│           └── results-summary.tsx  server: HTML metrics table
├── components/ui/               shadcn primitives (Button, Input, Label, Card)
├── lib/
│   ├── utils.ts                 cn() helper
│   └── supabase/
│       ├── client.ts            createBrowserClient for client components
│       ├── server.ts            createServerClient for RSC / Server Actions
│       └── proxy.ts             token refresh + route protection logic
└── proxy.ts                     Next.js proxy entrypoint (formerly middleware.ts)

api/
└── analyze.py                   Vercel Python serverless: JWT verify + worker.analyze.main()

supabase/migrations/             SQL migrations, apply via Dashboard SQL Editor

worker/                          Python analysis worker
├── analyze.py                   entry: CAS + parse + simulate + write-back
├── rh_parser.py                 Robinhood CSV → list[CashFlow]
├── metrics.py                   XIRR + CAGR
├── benchmark.py                 yfinance + deposit-mirrored sim (Postgres-cached)
├── chart.py                     Plotly figure builder (returns JSON)
└── requirements.txt             stub: `-r ../requirements.txt`

scripts/
└── dev_python_server.py         stdlib HTTPServer wrapping api/analyze (local dev)

requirements.txt                 root Python deps (Vercel reads from here)
vercel.json                      function config (maxDuration, memory)
```

## Security notes

- `getUser()` validates the JWT against Supabase on every request; `getSession()` is **not** used for auth decisions (it reads from cookies without verification).
- All public tables have RLS enabled; service role key is server-only and never sent to the browser.
- The 5-analysis cap is enforced both in the UI and via a Postgres trigger (defense in depth).
- CSVs are uploaded to a private bucket with per-user folder isolation; users can only read/write paths under `<their-uid>/...`.

## Roadmap

- [x] Phase 1: Auth (sign up, log in, password reset)
- [x] Phase 2: New-analysis form + CSV upload to Supabase Storage
- [x] Phase 3: Python analysis worker (math-only, local CLI)
- [x] Phase 3.5: HTTP wrapper (`api/analyze.py`) + UI trigger/polling
- [x] Phase 4: Results page — interactive Plotly chart + HTML summary table
- [x] Phase 5: Delete-an-analysis UI to free a slot
- [x] Phase 6: Deploy to Vercel (prod env vars + Auth redirect URLs, end-to-end smoke test in prod)
- [x] Phase 7: Custom SMTP via Resend (shared sender; custom-domain DNS setup is a future polish step)

## License

MIT. See [LICENSE](LICENSE).
