# do-i-beat-the-index-web

Web app version of [do-i-beat-the-index](https://github.com/vinamrajain99/do-i-beat-the-index) — the same deposit-mirrored portfolio-vs-benchmark analysis, but with login, persistent saved analyses, and a browser UI.

**Status: under construction.** Phase 1 (auth) is complete; phases 2–5 (CSV upload, analysis pipeline, results UI, history) are in progress.

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

Once it's up, go to **Project Settings → API** and copy the three credentials below into a new `.env.local` file in this directory (start from `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Apply the database schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of `supabase/migrations/20260510000000_init_schema.sql`, and click **Run**. This creates the `analyses` table, RLS policies, the 5-analysis-per-user trigger, the `csvs` storage bucket, and the benchmark price cache table.

### 3. Configure Supabase Auth

In the Supabase dashboard:

- **Auth → URL Configuration**: set **Site URL** to `http://localhost:3000` (later: your Vercel URL). Add `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/reset-password` to **Redirect URLs**.
- **Auth → Providers → Email**: enable, and turn on "Confirm email" (default).

### 4. Install and run

```bash
npm install
npm run dev
```

App is at [http://localhost:3000](http://localhost:3000).

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
│   │   ├── reset-password/      page + server action (sets new password)
│   │   ├── callback/route.ts    exchanges email-link code for session
│   │   └── sign-out/actions.ts  server action used by Sign out button
│   └── dashboard/page.tsx       protected; lists user's analyses
├── components/ui/               shadcn primitives (Button, Input, Label, Card)
├── lib/
│   ├── utils.ts                 cn() helper
│   └── supabase/
│       ├── client.ts            createBrowserClient for client components
│       ├── server.ts            createServerClient for RSC / Server Actions
│       └── proxy.ts             token refresh + route protection logic
└── proxy.ts                     Next.js proxy entrypoint (formerly middleware.ts)

supabase/migrations/             SQL migrations, apply via Dashboard SQL Editor
```

## Security notes

- `getUser()` validates the JWT against Supabase on every request; `getSession()` is **not** used for auth decisions (it reads from cookies without verification).
- All public tables have RLS enabled; service role key is server-only and never sent to the browser.
- The 5-analysis cap is enforced both in the UI and via a Postgres trigger (defense in depth).
- CSVs are uploaded to a private bucket with per-user folder isolation; users can only read/write paths under `<their-uid>/...`.

## Roadmap

- [x] Phase 1: Auth (sign up, log in, password reset)
- [ ] Phase 2: CSV upload to Supabase Storage
- [ ] Phase 3: Python serverless `/api/analyze` (reuses CLI math)
- [ ] Phase 4: Results page (Plotly chart + summary table)
- [ ] Phase 5: Saved-analysis history + 5-cap enforcement + delete
- [ ] Phase 6: Deploy to Vercel

## License

MIT. See [LICENSE](LICENSE).
