-- Call-Minutes Relationship Game — initial schema
-- Two allow-listed accounts share one ledger. Sign-ups must stay disabled
-- (supabase/config.toml locally, Auth settings in the hosted project); the
-- only two auth.users rows are created by scripts/seed-users.mjs.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per allow-listed partner, mirrors auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- app_settings: single-row config, all economy constants live here
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true constraint app_settings_singleton check (id),
  timezone text not null default 'UTC',
  daily_credit numeric not null default 15,
  move_ring_bonus numeric not null default 2,
  workout_bonus numeric not null default 7.5,
  badge_bonus numeric not null default 5,
  punishment_target_reps integer not null default 50,
  punishment_overdue_days integer not null default 7,
  punishment_overdue_penalty numeric not null default 20,
  backfill_days integer not null default 3,
  duplicate_tolerance_minutes numeric not null default 5,
  last_rollover_date date,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- ledger_entries: append-only. Balance = sum(amount). Corrections are
-- reversing rows (reversal_of), never edits or deletes.
-- ---------------------------------------------------------------------------
create type public.ledger_entry_type as enum (
  'daily_credit',
  'move_ring',
  'workout',
  'badge',
  'call',
  'punishment_overdue',
  'reversal'
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  entry_type public.ledger_entry_type not null,
  amount numeric not null,
  person_id uuid references public.profiles (id),
  source_table text,
  source_id uuid,
  reversal_of uuid references public.ledger_entries (id),
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index ledger_entries_entry_date_idx on public.ledger_entries (entry_date);
create index ledger_entries_source_idx on public.ledger_entries (source_table, source_id);

-- Idempotency guard for the scheduled daily credit (E1): one per calendar day, shared.
create unique index ledger_entries_daily_credit_unique
  on public.ledger_entries (entry_date)
  where entry_type = 'daily_credit';

-- ---------------------------------------------------------------------------
-- move_rings (E2): one tick per person per day. Unticking reverses the credit.
-- ---------------------------------------------------------------------------
create table public.move_rings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id),
  day date not null,
  ticked boolean not null default true,
  backfilled boolean not null default false,
  ledger_entry_id uuid references public.ledger_entries (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, day)
);

-- ---------------------------------------------------------------------------
-- workouts (E3): flat bonus, one per person per day.
-- ---------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id),
  day date not null,
  duration_minutes integer not null check (duration_minutes in (30, 45)),
  backfilled boolean not null default false,
  ledger_entry_id uuid references public.ledger_entries (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (person_id, day)
);

-- ---------------------------------------------------------------------------
-- weekly_badges (E4): Mon-Sun week, needs 7/7 move rings, claimable through
-- the backfill window (Sun..Sun+backfill_days).
-- ---------------------------------------------------------------------------
create table public.weekly_badges (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id),
  week_start date not null,
  status text not null default 'claimed' check (status in ('claimed', 'reversed')),
  ledger_entry_id uuid references public.ledger_entries (id),
  claimed_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (person_id, week_start)
);

-- ---------------------------------------------------------------------------
-- calls (E5/E6): logged minutes, optionally halved ("bad day"), optionally
-- flagged inappropriate (spawns punishments).
-- ---------------------------------------------------------------------------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  call_date date not null,
  minutes numeric not null check (minutes > 0),
  bad_day boolean not null default false,
  inappropriate boolean not null default false,
  logged_by uuid not null references public.profiles (id),
  backfilled boolean not null default false,
  disputed boolean not null default false,
  dispute_note text,
  disputed_by uuid references public.profiles (id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  ledger_entry_id uuid references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calls_call_date_idx on public.calls (call_date);

-- ---------------------------------------------------------------------------
-- punishments (P1-P5): one per person per flagged call.
-- ---------------------------------------------------------------------------
create table public.punishments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls (id),
  person_id uuid not null references public.profiles (id),
  assigned_date date not null,
  exercise_type text check (exercise_type in ('push_ups', 'tricep_curls')),
  status text not null default 'open' check (status in ('open', 'completed', 'voided')),
  penalty_count integer not null default 0,
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (call_id, person_id)
);

create index punishments_open_idx on public.punishments (status) where status = 'open';

-- ---------------------------------------------------------------------------
-- punishment_attempts (P3): attempts are logged; same-day attempts sum
-- toward the target (per-day reset, no carryover across days).
-- ---------------------------------------------------------------------------
create table public.punishment_attempts (
  id uuid primary key default gen_random_uuid(),
  punishment_id uuid not null references public.punishments (id),
  person_id uuid not null references public.profiles (id),
  day date not null,
  reps integer not null check (reps > 0),
  created_at timestamptz not null default now()
);

create index punishment_attempts_lookup_idx on public.punishment_attempts (punishment_id, day);

-- ---------------------------------------------------------------------------
-- activity_log: human-readable audit trail for every create/edit/delete/
-- dispute across the gameplay tables (L1, L3, "Rules trusted" metric).
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);
create index activity_log_created_at_idx on public.activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- daily_rollover_log: idempotency record for the scheduled job, independent
-- of the ledger unique index so the job can tell "already ran" from "already
-- posted" without scanning ledger_entries.
-- ---------------------------------------------------------------------------
create table public.daily_rollover_log (
  day date primary key,
  posted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: exactly two allow-listed accounts exist (enforced by
-- disabled public sign-up + scripts/seed-users.mjs), so any authenticated
-- user has full access — "equal permissions" per the PRD. All ledger-
-- affecting writes must go through the RPC functions in 0002, not raw
-- inserts, so business rules (idempotency, reversals, self-only badges)
-- can't be bypassed from the client.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.move_rings enable row level security;
alter table public.workouts enable row level security;
alter table public.weekly_badges enable row level security;
alter table public.calls enable row level security;
alter table public.punishments enable row level security;
alter table public.punishment_attempts enable row level security;
alter table public.activity_log enable row level security;
alter table public.daily_rollover_log enable row level security;

create policy "authenticated read profiles" on public.profiles for select to authenticated using (true);

create policy "authenticated read settings" on public.app_settings for select to authenticated using (true);
create policy "authenticated update settings" on public.app_settings for update to authenticated using (true) with check (true);

create policy "authenticated read ledger" on public.ledger_entries for select to authenticated using (true);

create policy "authenticated read move_rings" on public.move_rings for select to authenticated using (true);
create policy "authenticated read workouts" on public.workouts for select to authenticated using (true);
create policy "authenticated read badges" on public.weekly_badges for select to authenticated using (true);
create policy "authenticated read calls" on public.calls for select to authenticated using (true);
create policy "authenticated read punishments" on public.punishments for select to authenticated using (true);
create policy "authenticated read attempts" on public.punishment_attempts for select to authenticated using (true);
create policy "authenticated read activity_log" on public.activity_log for select to authenticated using (true);
create policy "authenticated read rollover_log" on public.daily_rollover_log for select to authenticated using (true);

-- Writes to gameplay tables happen only via SECURITY DEFINER RPCs (0002),
-- which are owned by postgres and bypass RLS internally; no direct insert/
-- update/delete policies are granted to `authenticated` on purpose.
