-- Revoke EXECUTE on the trigger function from PUBLIC, anon, and authenticated.
-- The function is SECURITY DEFINER (so the trigger can enforce the per-user
-- cap regardless of the calling user's privileges), but it is only ever meant
-- to be invoked as a BEFORE INSERT trigger — never directly via PostgREST RPC.
-- Without this revoke, the Supabase database linter (advisors 0028/0029)
-- correctly flags it as callable by anon/authenticated via /rest/v1/rpc/.
-- Triggers run as the table owner, so they're unaffected by these revokes.

revoke execute on function public.enforce_analysis_limit() from public, anon, authenticated;
