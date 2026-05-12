-- ---------------------------------------------------------------------------
-- Initial schema for do-i-beat-the-index-web
--
-- Apply by either:
--   1. Pasting this whole file into the Supabase Dashboard → SQL Editor → Run
--   2. Or via the Supabase CLI: `supabase db push` after `supabase link`
--
-- Notes:
--   - Every public table has RLS enabled with policies that scope rows to
--     auth.uid(). Anyone querying via anon/authenticated keys sees only
--     their own rows. The service_role key bypasses RLS by design and is
--     used by our Python serverless function.
--   - A trigger enforces a hard cap of 5 analyses per user (defense in depth;
--     the UI also enforces this).
--   - The `csvs` storage bucket is private; users can only read/write paths
--     under `<their-uid>/...`.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- 1. analyses table
-- ============================================================================

create table public.analyses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 80),
  current_value_usd   numeric(20, 2) not null check (current_value_usd > 0),
  benchmark_tickers   text[] not null check (
                        array_length(benchmark_tickers, 1) between 1 and 5
                      ),
  csv_storage_path    text not null,
  status              text not null default 'pending' check (
                        status in ('pending', 'running', 'completed', 'failed')
                      ),
  error_message       text,
  -- Frozen snapshot of metrics + time-series data. Populated when the
  -- analysis job completes. Shape documented in lib/types.ts.
  results_json        jsonb,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index analyses_user_created_idx
  on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

create policy "analyses_select_own"
  on public.analyses for select
  using (auth.uid() = user_id);

create policy "analyses_insert_own"
  on public.analyses for insert
  with check (auth.uid() = user_id);

create policy "analyses_update_own"
  on public.analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "analyses_delete_own"
  on public.analyses for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- 2. Trigger: enforce max 5 analyses per user
-- ============================================================================

create or replace function public.enforce_analysis_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.analyses where user_id = new.user_id) >= 5 then
    raise exception 'analysis_limit_reached'
      using hint = 'Delete an existing analysis to create a new one (max 5 per user).';
  end if;
  return new;
end;
$$;

create trigger analyses_limit_check
  before insert on public.analyses
  for each row execute function public.enforce_analysis_limit();

-- ============================================================================
-- 3. Storage bucket for user-uploaded Robinhood CSVs
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('csvs', 'csvs', false, 10 * 1024 * 1024, array['text/csv', 'application/vnd.ms-excel', 'text/plain'])
on conflict (id) do nothing;

-- Per-user folder isolation. Files must live at `<user_uid>/<filename>`.
-- The first folder segment must equal auth.uid().

create policy "csvs_select_own"
  on storage.objects for select
  using (
    bucket_id = 'csvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "csvs_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'csvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Even though we don't currently upsert, granting UPDATE matches the upsert
-- pattern in case we change strategy. Without UPDATE, supabase-js .upsert()
-- silently fails after the first upload.
create policy "csvs_update_own"
  on storage.objects for update
  using (
    bucket_id = 'csvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "csvs_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'csvs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- 4. (Optional) Shared benchmark price cache
--    Populated by the Python analysis function; readable by all authenticated
--    users so repeat analyses with the same benchmarks don't re-fetch.
-- ============================================================================

create table public.benchmark_price_cache (
  ticker        text not null,
  trade_date    date not null,
  adj_close     numeric(20, 6) not null,
  fetched_at    timestamptz not null default now(),
  primary key (ticker, trade_date)
);

alter table public.benchmark_price_cache enable row level security;

-- Read-only for authenticated users; writes happen via service_role only.
create policy "benchmark_cache_read_authenticated"
  on public.benchmark_price_cache for select
  to authenticated
  using (true);
