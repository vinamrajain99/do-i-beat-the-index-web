# Do I beat the index?

An honest check on whether your actual Robinhood portfolio has outperformed a simple "what if you'd just bought VTI instead" strategy. Multi-user, browser-based, with saved analyses.

**Live at https://do-i-beat-the-index-web.vercel.app.**

> Note: the app is not currently accepting new user signups while custom-domain email setup is pending.

## Why this exists

Many individual retail investors are susceptible to stock picking. It's hard not to be: online feeds are wall-to-wall with investing influencers who package "analysis" into catchy 60-second reels, and the firehose of tips makes it feel like *not* trading would be leaving money on the table.

But the popular wisdom is unambiguous: roughly 80% of professional fund managers fail to beat their benchmark over a 10-year window, and retail numbers are almost certainly worse. So the nagging question for any active stock-picker becomes:

> Would you be better off putting whatever you want to invest into a single benchmark like VTI or QQQ?

The only honest way to know is to compare your actual returns against an apples-to-apples counterfactual: same money in, same dates, but routed into one index instead of your hand-picked basket of trades. That's exactly what this app does. Up to 5 benchmarks at once, with a clean interactive chart and a summary table — and your past analyses persist to your account so you can come back and re-run as the market moves.

## What it does

- **Sign in** with email + password (Supabase auth, email-confirmation flow).
- **Upload** your Robinhood activity CSV (downloaded from the Robinhood website — see Usage below).
- **Pick up to 5 benchmark tickers** (e.g. `VTI`, `SPY`, `QQQ`, `VOO`, `VXUS`). Anything Yahoo Finance supports works.
- **Enter your current Robinhood portfolio total** — just the headline number you can read off the app, no manual breakdown required.
- The app identifies your external cash flows (ACH deposits and withdrawals into/out of Robinhood), simulates what each benchmark would have done with the same money on the same dates, and compares the counterfactual to your real portfolio.
- Get an **interactive Plotly chart** plus a **summary table**: current value, dollar gain/loss, total return, CAGR, money-weighted IRR (XIRR), and `$/%` delta vs each benchmark.
- **Save up to 5 analyses per account** — come back any time to re-open or delete.

## How the math works (and why)

The core principle is: **hold one thing constant — your external cash flow into the brokerage — and vary one thing — what the cash gets routed into.** Everything else (which specific stocks you bought and sold, when dividends paid out, when you reinvested them) is *internal* to whichever strategy you're evaluating, and should compound inside that strategy without leaking across.

### What gets mirrored

Only ACH and wire transfers between your bank and Robinhood:

| Event in your CSV | Actual side | Benchmark counterfactual |
| --- | --- | --- |
| ACH deposit `$X` on date `D` | (untracked — you give today's total) | `shares_bm += X / adj_close(D)` |
| ACH withdrawal `$Y` on date `D` | (untracked) | `shares_bm -= Y / adj_close(D)` |
| Buy / Sell / Dividend / DRIP / Split / Options / Crypto / Interest | Ignored | Ignored |

That's it. Every internal Robinhood event is ignored on both sides. The comparison stays honest, apples-to-apples, and mathematically accurate.

### Why this is an honest dividend-reinvestment comparison

Your real portfolio reinvests dividends back into the same asset (Robinhood DRIP). The benchmark counterfactual needs to do the same thing — otherwise the index would be unfairly penalised for not compounding. This comes for free from using **total-return adjusted close prices** from Yahoo Finance (via `yfinance` with `auto_adjust=True`). An adjusted close at past date `D` is mathematically equivalent to "$1 invested on `D` with every benchmark dividend reinvested through to today." So when the simulation computes `shares_added = $X / adj_close(D)` on a deposit, the resulting share count grows with both price appreciation *and* reinvested dividends, just like real DRIP would.

Symmetrically:

- **Your actual portfolio**: you supply today's total value as a number (read straight off the Robinhood app). That number already bakes in every dividend you reinvested, every split, and every internal asset shuffle you made — because it's the real number.
- **The benchmark portfolio**: total-return adjusted close handles all the compounding.

Both sides DRIP their own dividends. Only the asset choice differs.

### Why individual buys aren't mirrored

An earlier design mirrored every user-initiated buy with a matching benchmark buy on the same date. That sounds clean but isn't: if a buy was funded by accumulated dividend cash or by the proceeds of a recent sale, mirroring it as a fresh benchmark purchase double-counts capital (since those dividends are already compounded inside the benchmark's adjusted close, and the proceeds came from a sale that itself should mirror to a benchmark sale). Detecting which buys are "external-funded" vs. "internal-funded" requires brittle heuristics on the CSV (DRIP buys look identical to user buys; you'd have to match against dividends within a few days, etc.).

Mirroring only external ACH flows sidesteps the whole class of bugs. The trade-off is that this app answers the question "did your picking beat indexing the same money you put in?" — not the per-trade question "did each of your individual picks outperform a same-day benchmark buy?" The former is the more meaningful question for most retail investors, and it's the question this app is built to answer.

### Money-weighted return (XIRR)

Final dollar value alone doesn't account for *when* the money went in. A 50% gain on $10K deposited yesterday is very different from a 50% gain on $10K deposited a decade ago. The report shows **XIRR** (money-weighted internal rate of return) for both your actual portfolio and each benchmark, computed from your deposit/withdrawal cash flows plus today's final value. It lets you compare strategies apples-to-apples even when their dollar magnitudes differ.

## Usage

### 1. Download your Robinhood activity CSV

This requires the Robinhood **web** app — the mobile app doesn't expose the CSV export.

1. Log in at [robinhood.com](https://robinhood.com).
2. Click your account icon → **Settings** → **Account information** → **Reports and statements**.
3. Generate an **Activity report** covering a date range from your earliest activity to today.
4. Wait a couple of minutes, then download the CSV.

### 2. Note your current Robinhood portfolio total

Open the Robinhood app or web dashboard and read your total account value. It's the headline number on your portfolio page — something like `$47,250.18`.

### 3. Submit the analysis

Sign in at the live URL above, click **+ New analysis**, fill in:

- A name for the analysis (any short label — e.g. "May 2026 check-in")
- Your current portfolio value (just the number, no `$`)
- One to five benchmark tickers (chips in the form)
- The CSV you just downloaded

The app queues the analysis, runs the simulation server-side (typically under 30 seconds when the benchmark price cache is warm), and the page auto-refreshes when results are ready.

### 4. Read the report

- **Lines on the chart**: one per benchmark, showing what the counterfactual portfolio would have been worth on each business day.
- **Black star**: your actual portfolio at its current value (today).
- **Green triangles**: deposits, sized roughly by amount.
- **Red triangles**: withdrawals.
- Hover any point for the date and dollar value.

The summary table below the chart shows current value, dollar gain, total return percent, CAGR, XIRR, and dollar/percent delta vs your actual portfolio, for each strategy. A **negative** Δ means the benchmark underperformed your portfolio — your stock-picking beat that index. A **positive** Δ means the benchmark beat you.

## Privacy and data

- **We never ask for your brokerage credentials.** No Robinhood login, no OAuth, no 2FA dances. The only data the app sees is the CSV you download yourself and the headline portfolio value you type in.
- **Your CSV is stored in a private folder** in Supabase Storage (`csvs/<your-user-id>/<analysis-id>.csv`), scoped to your account by Postgres row-level-security policies. No other user (or anonymous request) can read it. Deleting an analysis removes both the database row and the CSV.
- **The only outbound data call** from the analysis worker (besides Supabase itself) is to Yahoo Finance for benchmark prices — ticker symbol and date range only, no personal info.
- **Benchmark prices are cached** in a shared Postgres table. Once "SPY 2020-01-01 through today" has been fetched, subsequent analyses with overlapping date ranges hit the cache.

## Architecture

- **Frontend**: Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui, deployed on **Vercel**
- **Backend compute**: Python serverless function in the same Vercel deployment (`api/analyze.py` → `worker/` package; the worker is also directly invokable from the command line for debugging)
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

- **Auth → URL Configuration**: set **Site URL** to `http://localhost:3000` (later: your Vercel URL). Add `http://localhost:3000/auth/confirm` and `http://localhost:3000/auth/reset-password` to **Redirect URLs**.
- **Auth → Email Templates**: edit "Confirm signup" link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` and "Reset Password" link to `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`. The defaults use `{{ .ConfirmationURL }}` which is vulnerable to mail-scanner link prefetching — see DECISIONS.md.
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
For local development, it runs as a stand-alone HTTP server via stdlib
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
│   ├── layout.tsx               root layout, fonts, global NavBar, Toaster
│   ├── page.tsx                 landing page (redirects to /dashboard if signed in)
│   ├── about/page.tsx           public methodology page (motivation, math, data sources)
│   ├── auth/
│   │   ├── layout.tsx           centered card layout for all auth pages
│   │   ├── login/               page + server action
│   │   ├── signup/              page + server action (sends confirmation email)
│   │   ├── forgot-password/     page + server action (sends reset email)
│   │   ├── reset-password/      server page (reads token_hash) + form.tsx (client) + actions.ts (verifyOtp + updateUser)
│   │   ├── confirm/             server page + form.tsx + actions.ts — same shape, for signup email confirmation
│   │   └── sign-out/actions.ts  server action used by Sign out button
│   └── dashboard/
│       ├── page.tsx             list of analyses (max 5) + "+ New analysis" + per-row Delete
│       ├── actions.ts           deleteAnalysisAction (row + CSV cleanup + redirect)
│       ├── delete-button.tsx    client: confirm + invoke delete action
│       ├── new/
│       │   ├── page.tsx         form: name, value, benchmark chips, CSV upload
│       │   └── actions.ts       server action: validate, insert, upload, redirect
│       └── [id]/
│           ├── page.tsx         server: header, overview (Cash flow + Current value cards), status-keyed body
│           ├── analysis-runner.tsx  client: POST /api/analyze + 3s polling
│           ├── plotly-chart.tsx     client: dynamic-imported Plotly.newPlot
│           └── results-summary.tsx  server: HTML metrics table
├── components/
│   ├── nav-bar.tsx              global top sticky nav (server; signed-in vs signed-out variants)
│   ├── nav-link.tsx             client child of nav-bar; active-route highlight
│   └── ui/                      shadcn primitives (Button, Input, Label, Card)
├── lib/
│   ├── utils.ts                 cn() helper
│   ├── types.ts                 Analysis + ResultsJson types + UI caps (MAX_ANALYSES_PER_USER, etc.)
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

## License

MIT. See [LICENSE](LICENSE).
