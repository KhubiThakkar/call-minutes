# Call Minutes

A private, two-person web app that turns phone-call time into a shared, earnable budget. See the PRD (shared separately) for the full rules; this README covers setup.

Stack: Next.js 16 (App Router, Turbopack) + Tailwind v4 + shadcn/ui, Supabase (Postgres, Auth, RLS) for the backend, a Supabase Edge Function + pg_cron for the scheduled daily rollover.

## How the economy logic is structured

All rules live in Postgres, not in the app:

- `supabase/migrations/0001_init_schema.sql` — tables, RLS, the `app_settings` table holding every tunable constant.
- `supabase/migrations/0002_economy_functions.sql` — one `SECURITY DEFINER` RPC per mutation (tick a move ring, log a workout, claim a badge, log/edit/delete/dispute a call, log a punishment attempt). The ledger is append-only; edits and deletes post reversing entries, never overwrite. These are the **only** way gameplay tables are written — there are no direct insert/update policies granted to the client.
- `supabase/migrations/0003_schedule_rollover.sql` — pg_cron, every 15 minutes, calling the `rollover` Edge Function, which calls `fn_run_daily_rollover()`. That function is idempotent and catches up any missed days/penalties, so a 15-minute cadence (rather than a fixed UTC time) sidesteps DST drift on the shared timezone.
- `src/lib/actions/*.ts` — thin Next.js Server Actions that call the RPCs and revalidate the relevant pages. No business logic here.

## First-time setup

1. **Create a Supabase project** (or run `npx supabase start` locally if you have Docker — the CLI is already initialized in `supabase/`).
2. **Link and push the schema**:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Copy env vars**: `cp .env.local.example .env.local` and fill in the Supabase URL/anon key (Project Settings → API) plus the service role key and the two partners' emails/passwords/names.
4. **Create the two allow-listed accounts** (there is no public sign-up):
   ```bash
   node --env-file=.env.local scripts/seed-users.mjs
   ```
   Confirm sign-ups are disabled in the hosted project's Authentication → Settings (local dev already has this off in `supabase/config.toml`).
5. **Deploy the rollover Edge Function and schedule it**:
   ```bash
   npx supabase functions deploy rollover
   ```
   Then, once, in the SQL editor:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   (Migration `0003` schedules the cron job itself.)
6. **Set the shared timezone**: edit it on the Settings page in the app, or update `app_settings.timezone` directly — it's an IANA name (e.g. `America/New_York`).
7. `npm run dev` and sign in with one of the seeded accounts.

## Regenerating types

`src/lib/supabase/database.types.ts` is hand-written to match the migrations (the generator doesn't infer the PL/pgSQL RPC return shapes well). If you change the schema, update it alongside the migration, or run `npx supabase gen types typescript --local` and merge.

## Notes

- Every page under `src/app/(app)` is dynamic (auth-gated, live shared data) — `cacheComponents` is disabled in `next.config.ts` on purpose.
- `src/proxy.ts` is Next.js 16's renamed `middleware.ts`; it refreshes the auth cookie and redirects unauthenticated requests to `/login`.
- Testing note: the economy RPCs (tick/untick idempotency, duplicate-call detection, bad-day halving, punishment void/reversal rules, rollover catch-up math, badge claim/reversal) were exercised end-to-end against a real local Postgres instance during development — not just read over. There was no Docker available to run the full local Supabase stack, so that hasn't been verified yet; do a pass through `supabase start` (if you have Docker) or the hosted project before relying on it in production.
