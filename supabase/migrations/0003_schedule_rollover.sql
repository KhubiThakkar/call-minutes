-- Schedules the `rollover` Edge Function via pg_cron + pg_net.
--
-- Runs every 15 minutes rather than once at a fixed UTC time: the shared
-- timezone is configurable and DST shifts the UTC offset of "local midnight"
-- through the year, so a fixed cron time would drift. fn_run_daily_rollover
-- is idempotent and timezone-aware (fn_today() reads app_settings.timezone),
-- so a 15-minute cadence just means the daily credit and overdue penalties
-- post within 15 minutes of actually crossing the boundary — never double-
-- posted, and any missed run is caught up on the next tick.
--
-- The project URL and service role key aren't known at migration-write time
-- (and must never be committed in plaintext), so they're read from Vault.
-- After deploying, set them once via the SQL editor or `supabase secrets`:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- Local dev: the Supabase CLI's local stack doesn't run pg_cron jobs against
-- the real internet, so for local testing just invoke the function directly
-- (see supabase/functions/rollover/index.ts) or call
-- `select fn_run_daily_rollover();` directly in the SQL editor.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema extensions;

select
  cron.schedule(
    'daily-rollover',
    '*/15 * * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/rollover',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    );
    $$
  )
where not exists (select 1 from cron.job where jobname = 'daily-rollover');
