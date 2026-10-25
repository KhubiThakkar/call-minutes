-- Economy business logic. Every ledger-affecting mutation goes through one
-- of these SECURITY DEFINER functions (never a raw table write from the
-- client) so idempotency, reversals and self-only rules can't be bypassed.
-- All are granted to `authenticated` only; anon/public have no access.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create function public.fn_today()
returns date
language sql
stable
as $$
  select (now() at time zone (select timezone from public.app_settings))::date;
$$;

create function public.fn_require_profile()
returns uuid
language plpgsql
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function public.fn_validate_loggable_date(p_day date)
returns void
language plpgsql
stable
as $$
declare
  v_today date := public.fn_today();
  v_backfill_days integer;
begin
  select backfill_days into v_backfill_days from public.app_settings;
  if p_day > v_today then
    raise exception 'cannot log a future date' using errcode = '22023';
  end if;
  if p_day < v_today - v_backfill_days then
    raise exception 'date is outside the %-day backfill window', v_backfill_days using errcode = '22023';
  end if;
end;
$$;

create function public.fn_log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_detail jsonb default null)
returns void
language sql
as $$
  insert into public.activity_log (actor_id, entity_type, entity_id, action, detail)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- balance + home screen snapshot
-- ---------------------------------------------------------------------------
create function public.fn_get_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0) from public.ledger_entries;
$$;

-- ---------------------------------------------------------------------------
-- E2: move ring toggle (tick/untick), with badge invalidation on untick
-- ---------------------------------------------------------------------------
create function public.fn_toggle_move_ring(p_person_id uuid, p_day date, p_ticked boolean)
returns public.move_rings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_row public.move_rings;
  v_existed boolean;
  v_bonus numeric;
  v_entry_id uuid;
  v_week_start date;
  v_ticked_count integer;
  v_badge public.weekly_badges;
begin
  if not exists (select 1 from public.profiles where id = p_person_id) then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  select move_ring_bonus into v_bonus from public.app_settings;

  select * into v_row from public.move_rings where person_id = p_person_id and day = p_day for update;
  v_existed := found; -- capture now: later INSERT/UPDATE ... RETURNING would overwrite FOUND

  if p_ticked then
    -- Only new/restored ticks are backfill-gated (L2). Unticking is a
    -- correction, not a new entry, and must stay possible well past the
    -- window so a badge claimed for a finished week can still be reversed
    -- (edge case: "move ring unticked after the weekly badge was claimed").
    perform public.fn_validate_loggable_date(p_day);
    if v_existed and v_row.ticked then
      return v_row; -- idempotent no-op
    end if;
    insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, created_by, description)
    values (p_day, 'move_ring', v_bonus, p_person_id, 'move_rings', v_actor, 'Move ring')
    returning id into v_entry_id;

    if v_existed then
      update public.move_rings
        set ticked = true, ledger_entry_id = v_entry_id, updated_at = now()
        where id = v_row.id
        returning * into v_row;
    else
      insert into public.move_rings (person_id, day, ticked, backfilled, ledger_entry_id, created_by)
      values (p_person_id, p_day, true, p_day <> public.fn_today(), v_entry_id, v_actor)
      returning * into v_row;
    end if;

    update public.ledger_entries set source_id = v_row.id where id = v_entry_id;
    perform public.fn_log_activity('move_ring', v_row.id, 'tick', jsonb_build_object('day', p_day, 'person_id', p_person_id));
    return v_row;
  else
    if not v_existed or not v_row.ticked then
      return v_row; -- idempotent no-op (nothing to untick)
    end if;

    insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, source_id, reversal_of, created_by, description)
    values (p_day, 'reversal', -v_bonus, p_person_id, 'move_rings', v_row.id, v_row.ledger_entry_id, v_actor, 'Move ring unticked');

    update public.move_rings
      set ticked = false, ledger_entry_id = null, updated_at = now()
      where id = v_row.id
      returning * into v_row;

    perform public.fn_log_activity('move_ring', v_row.id, 'untick', jsonb_build_object('day', p_day, 'person_id', p_person_id));

    -- Badge invalidation: if a badge was claimed for this person's week and
    -- it no longer has 7/7 ticked days, reverse the badge too.
    v_week_start := p_day - (extract(isodow from p_day)::int - 1);
    select * into v_badge from public.weekly_badges
      where person_id = p_person_id and week_start = v_week_start and status = 'claimed';
    if found then
      select count(*) into v_ticked_count from public.move_rings
        where person_id = p_person_id and day between v_week_start and v_week_start + 6 and ticked = true;
      if v_ticked_count < 7 then
        perform public.fn_reverse_badge(v_badge.id);
      end if;
    end if;

    return v_row;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- internal: reverse a claimed badge (used by untick, and available standalone)
-- ---------------------------------------------------------------------------
create function public.fn_reverse_badge(p_badge_id uuid)
returns public.weekly_badges
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_badge public.weekly_badges;
  v_bonus numeric;
begin
  select * into v_badge from public.weekly_badges where id = p_badge_id and status = 'claimed' for update;
  if not found then
    return v_badge;
  end if;
  select badge_bonus into v_bonus from public.app_settings;

  insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, source_id, reversal_of, created_by, description)
  values (public.fn_today(), 'reversal', -v_bonus, v_badge.person_id, 'weekly_badges', v_badge.id, v_badge.ledger_entry_id, auth.uid(), 'Badge reversed: week no longer 7/7');

  update public.weekly_badges
    set status = 'reversed', reversed_at = now()
    where id = v_badge.id
    returning * into v_badge;

  perform public.fn_log_activity('weekly_badge', v_badge.id, 'reversed', jsonb_build_object('week_start', v_badge.week_start, 'person_id', v_badge.person_id));
  return v_badge;
end;
$$;

-- ---------------------------------------------------------------------------
-- E3: workout, flat bonus, one per person per day
-- ---------------------------------------------------------------------------
create function public.fn_log_workout(p_person_id uuid, p_day date, p_duration_minutes integer)
returns public.workouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_bonus numeric;
  v_entry_id uuid;
  v_row public.workouts;
begin
  if not exists (select 1 from public.profiles where id = p_person_id) then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  if p_duration_minutes not in (30, 45) then
    raise exception 'workout duration must be 30 or 45 minutes' using errcode = '22023';
  end if;
  perform public.fn_validate_loggable_date(p_day);

  if exists (select 1 from public.workouts where person_id = p_person_id and day = p_day) then
    raise exception 'workout already logged for this day' using errcode = '23505';
  end if;

  select workout_bonus into v_bonus from public.app_settings;

  insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, created_by, description)
  values (p_day, 'workout', v_bonus, p_person_id, 'workouts', v_actor, format('%s-min workout', p_duration_minutes))
  returning id into v_entry_id;

  insert into public.workouts (person_id, day, duration_minutes, backfilled, ledger_entry_id, created_by)
  values (p_person_id, p_day, p_duration_minutes, p_day <> public.fn_today(), v_entry_id, v_actor)
  returning * into v_row;

  update public.ledger_entries set source_id = v_row.id where id = v_entry_id;
  perform public.fn_log_activity('workout', v_row.id, 'create', jsonb_build_object('day', p_day, 'duration_minutes', p_duration_minutes, 'person_id', p_person_id));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- E4: weekly badge claim. Claimable on Sunday through the backfill window.
-- ---------------------------------------------------------------------------
create function public.fn_claim_badge(p_person_id uuid, p_week_start date)
returns public.weekly_badges
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_today date := public.fn_today();
  v_backfill_days integer;
  v_bonus numeric;
  v_ticked_count integer;
  v_entry_id uuid;
  v_row public.weekly_badges;
  v_existed boolean;
begin
  if not exists (select 1 from public.profiles where id = p_person_id) then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  if extract(isodow from p_week_start)::int <> 1 then
    raise exception 'week_start must be a Monday' using errcode = '22023';
  end if;

  select backfill_days, badge_bonus into v_backfill_days, v_bonus from public.app_settings;

  if v_today < p_week_start + 6 then
    raise exception 'week is not over yet' using errcode = '22023';
  end if;
  if v_today > p_week_start + 6 + v_backfill_days then
    raise exception 'badge claim window has closed' using errcode = '22023';
  end if;

  select * into v_row from public.weekly_badges where person_id = p_person_id and week_start = p_week_start for update;
  v_existed := found; -- capture now: later statements would overwrite FOUND
  if v_existed and v_row.status = 'claimed' then
    return v_row; -- idempotent no-op
  end if;

  select count(*) into v_ticked_count from public.move_rings
    where person_id = p_person_id and day between p_week_start and p_week_start + 6 and ticked = true;
  if v_ticked_count < 7 then
    raise exception 'not eligible: % of 7 move rings ticked this week', v_ticked_count using errcode = '22023';
  end if;

  insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, created_by, description)
  values (v_today, 'badge', v_bonus, p_person_id, 'weekly_badges', v_actor, '1-week move-ring badge')
  returning id into v_entry_id;

  if v_existed then
    update public.weekly_badges
      set status = 'claimed', ledger_entry_id = v_entry_id, claimed_at = now(), reversed_at = null
      where id = v_row.id
      returning * into v_row;
  else
    insert into public.weekly_badges (person_id, week_start, status, ledger_entry_id)
    values (p_person_id, p_week_start, 'claimed', v_entry_id)
    returning * into v_row;
  end if;

  update public.ledger_entries set source_id = v_row.id where id = v_entry_id;
  perform public.fn_log_activity('weekly_badge', v_row.id, 'claimed', jsonb_build_object('week_start', p_week_start, 'person_id', p_person_id));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- E5/E6/P1: log a call. Returns a jsonb envelope so the client can surface a
-- near-duplicate warning without inserting (the "offer to merge" edge case).
-- ---------------------------------------------------------------------------
create function public.fn_log_call(
  p_call_date date,
  p_minutes numeric,
  p_bad_day boolean,
  p_inappropriate boolean,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_tolerance numeric;
  v_dupe public.calls;
  v_deduction numeric;
  v_entry_id uuid;
  v_call public.calls;
  v_person record;
  v_punishments jsonb := '[]'::jsonb;
  v_punishment public.punishments;
begin
  if p_minutes <= 0 then
    raise exception 'minutes must be positive' using errcode = '22023';
  end if;
  perform public.fn_validate_loggable_date(p_call_date);

  select duplicate_tolerance_minutes into v_tolerance from public.app_settings;

  if not p_confirm_duplicate then
    select * into v_dupe from public.calls
      where call_date = p_call_date
        and deleted_at is null
        and logged_by <> v_actor
        and abs(minutes - p_minutes) <= v_tolerance
      order by created_at desc
      limit 1;
    if found then
      return jsonb_build_object(
        'warning', 'possible_duplicate',
        'existing_call', to_jsonb(v_dupe)
      );
    end if;
  end if;

  v_deduction := case when p_bad_day then p_minutes / 2.0 else p_minutes end;

  insert into public.calls (call_date, minutes, bad_day, inappropriate, logged_by, backfilled)
  values (p_call_date, p_minutes, p_bad_day, p_inappropriate, v_actor, p_call_date <> public.fn_today())
  returning * into v_call;

  insert into public.ledger_entries (entry_date, entry_type, amount, source_table, source_id, created_by, description)
  values (p_call_date, 'call', -v_deduction, 'calls', v_call.id, v_actor,
    case when p_bad_day then format('Call: %s min (bad day, half deducted)', p_minutes) else format('Call: %s min', p_minutes) end)
  returning id into v_entry_id;

  update public.calls set ledger_entry_id = v_entry_id where id = v_call.id returning * into v_call;

  if p_inappropriate then
    for v_person in select id from public.profiles loop
      insert into public.punishments (call_id, person_id, assigned_date)
      values (v_call.id, v_person.id, p_call_date)
      returning * into v_punishment;
      v_punishments := v_punishments || to_jsonb(v_punishment);
    end loop;
  end if;

  perform public.fn_log_activity('call', v_call.id, 'create', to_jsonb(v_call));

  return jsonb_build_object('call', to_jsonb(v_call), 'punishments', v_punishments);
end;
$$;

-- ---------------------------------------------------------------------------
-- internal: void a punishment (only if no reps logged) and reverse any
-- overdue penalties it already caused. Shared by edit/delete call paths (L3).
-- ---------------------------------------------------------------------------
create function public.fn_void_punishment_if_clean(p_punishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_punishment public.punishments;
  v_attempt_count integer;
  v_penalty record;
begin
  select * into v_punishment from public.punishments where id = p_punishment_id and status = 'open' for update;
  if not found then
    return;
  end if;

  select count(*) into v_attempt_count from public.punishment_attempts where punishment_id = p_punishment_id;
  if v_attempt_count > 0 then
    return; -- reps logged: punishment stays open and owed (L3)
  end if;

  for v_penalty in
    select le.* from public.ledger_entries le
    where le.entry_type = 'punishment_overdue'
      and le.source_table = 'punishments'
      and le.source_id = p_punishment_id
      and not exists (select 1 from public.ledger_entries r where r.reversal_of = le.id)
  loop
    insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, source_id, reversal_of, created_by, description)
    values (public.fn_today(), 'reversal', -v_penalty.amount, v_penalty.person_id, 'punishments', p_punishment_id, v_penalty.id, auth.uid(), 'Overdue penalty reversed: punishment voided');
  end loop;

  update public.punishments set status = 'voided', voided_at = now() where id = p_punishment_id;
  perform public.fn_log_activity('punishment', p_punishment_id, 'voided', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- L1/L3: edit a call. Reversing entries, never silent overwrites.
-- ---------------------------------------------------------------------------
create function public.fn_edit_call(
  p_call_id uuid,
  p_minutes numeric,
  p_bad_day boolean,
  p_inappropriate boolean
)
returns public.calls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_old public.calls;
  v_old_deduction numeric;
  v_new_deduction numeric;
  v_entry_id uuid;
  v_call public.calls;
  v_person record;
  v_punishment public.punishments;
begin
  select * into v_old from public.calls where id = p_call_id and deleted_at is null for update;
  if not found then
    raise exception 'call not found' using errcode = '22023';
  end if;
  if p_minutes <= 0 then
    raise exception 'minutes must be positive' using errcode = '22023';
  end if;

  v_old_deduction := -1 * (select amount from public.ledger_entries where id = v_old.ledger_entry_id);
  v_new_deduction := case when p_bad_day then p_minutes / 2.0 else p_minutes end;

  if v_old_deduction <> v_new_deduction then
    insert into public.ledger_entries (entry_date, entry_type, amount, source_table, source_id, reversal_of, created_by, description)
    values (v_old.call_date, 'reversal', v_old_deduction, 'calls', v_old.id, v_old.ledger_entry_id, v_actor, 'Call edited: previous deduction reversed');

    insert into public.ledger_entries (entry_date, entry_type, amount, source_table, source_id, created_by, description)
    values (v_old.call_date, 'call', -v_new_deduction, 'calls', v_old.id, v_actor, 'Call edited: new deduction')
    returning id into v_entry_id;
  else
    v_entry_id := v_old.ledger_entry_id;
  end if;

  update public.calls
    set minutes = p_minutes, bad_day = p_bad_day, inappropriate = p_inappropriate,
        ledger_entry_id = v_entry_id, updated_at = now()
    where id = p_call_id
    returning * into v_call;

  if p_inappropriate and not v_old.inappropriate then
    for v_person in select id from public.profiles loop
      insert into public.punishments (call_id, person_id, assigned_date)
      values (v_call.id, v_person.id, v_call.call_date)
      on conflict (call_id, person_id) do nothing
      returning * into v_punishment;
    end loop;
  elsif v_old.inappropriate and not p_inappropriate then
    for v_punishment in select * from public.punishments where call_id = p_call_id loop
      perform public.fn_void_punishment_if_clean(v_punishment.id);
    end loop;
  end if;

  perform public.fn_log_activity('call', v_call.id, 'edit', jsonb_build_object('before', to_jsonb(v_old), 'after', to_jsonb(v_call)));
  return v_call;
end;
$$;

-- ---------------------------------------------------------------------------
-- L1: delete (soft) a call
-- ---------------------------------------------------------------------------
create function public.fn_delete_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_old public.calls;
  v_amount numeric;
  v_punishment public.punishments;
begin
  select * into v_old from public.calls where id = p_call_id and deleted_at is null for update;
  if not found then
    raise exception 'call not found' using errcode = '22023';
  end if;

  select amount into v_amount from public.ledger_entries where id = v_old.ledger_entry_id;

  insert into public.ledger_entries (entry_date, entry_type, amount, source_table, source_id, reversal_of, created_by, description)
  values (v_old.call_date, 'reversal', -v_amount, 'calls', v_old.id, v_old.ledger_entry_id, v_actor, 'Call deleted');

  update public.calls set deleted_at = now(), deleted_by = v_actor where id = p_call_id;

  for v_punishment in select * from public.punishments where call_id = p_call_id loop
    perform public.fn_void_punishment_if_clean(v_punishment.id);
  end loop;

  perform public.fn_log_activity('call', p_call_id, 'delete', to_jsonb(v_old));
end;
$$;

-- ---------------------------------------------------------------------------
-- L1: dispute a call (flag for conversation, no ledger effect)
-- ---------------------------------------------------------------------------
create function public.fn_dispute_call(p_call_id uuid, p_note text)
returns public.calls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_call public.calls;
begin
  update public.calls
    set disputed = true, dispute_note = p_note, disputed_by = v_actor, updated_at = now()
    where id = p_call_id and deleted_at is null
    returning * into v_call;
  if not found then
    raise exception 'call not found' using errcode = '22023';
  end if;
  perform public.fn_log_activity('call', v_call.id, 'dispute', jsonb_build_object('note', p_note));
  return v_call;
end;
$$;

-- ---------------------------------------------------------------------------
-- P2/P3: log a punishment attempt. Same-day attempts sum toward the target;
-- no carryover across days (next day starts back at zero).
-- ---------------------------------------------------------------------------
create function public.fn_log_punishment_attempt(
  p_punishment_id uuid,
  p_reps integer,
  p_exercise_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.fn_require_profile();
  v_punishment public.punishments;
  v_target integer;
  v_today date := public.fn_today();
  v_day_total integer;
  v_attempt public.punishment_attempts;
  v_completed boolean := false;
begin
  if p_reps <= 0 then
    raise exception 'reps must be positive' using errcode = '22023';
  end if;

  select * into v_punishment from public.punishments where id = p_punishment_id for update;
  if not found then
    raise exception 'punishment not found' using errcode = '22023';
  end if;
  if v_punishment.status <> 'open' then
    raise exception 'punishment is not open' using errcode = '22023';
  end if;
  if v_punishment.person_id <> v_actor then
    raise exception 'only the assigned person can log reps for this punishment' using errcode = '42501';
  end if;

  if v_punishment.exercise_type is null then
    if p_exercise_type is null or p_exercise_type not in ('push_ups', 'tricep_curls') then
      raise exception 'choose push_ups or tricep_curls' using errcode = '22023';
    end if;
    update public.punishments set exercise_type = p_exercise_type where id = p_punishment_id;
  end if;

  select punishment_target_reps into v_target from public.app_settings;

  insert into public.punishment_attempts (punishment_id, person_id, day, reps)
  values (p_punishment_id, v_actor, v_today, p_reps)
  returning * into v_attempt;

  select coalesce(sum(reps), 0) into v_day_total from public.punishment_attempts
    where punishment_id = p_punishment_id and day = v_today;

  if v_day_total >= v_target then
    update public.punishments set status = 'completed', completed_at = now() where id = p_punishment_id;
    v_completed := true;
  end if;

  perform public.fn_log_activity('punishment', p_punishment_id, 'reps_logged',
    jsonb_build_object('reps', p_reps, 'day_total', v_day_total, 'target', v_target, 'completed', v_completed));

  return jsonb_build_object('attempt', to_jsonb(v_attempt), 'day_total', v_day_total, 'target', v_target, 'completed', v_completed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled job (E1, E7): called by the `rollover` Edge Function on a cron.
-- Idempotent and catches up every missed day/milestone on a late run.
-- ---------------------------------------------------------------------------
create function public.fn_run_daily_rollover(p_asof date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := coalesce(p_asof, public.fn_today());
  v_daily_credit numeric;
  v_overdue_days integer;
  v_overdue_penalty numeric;
  v_start_day date;
  v_day date;
  v_credits_posted integer := 0;
  v_penalties_posted integer := 0;
  v_punishment record;
  v_days_open integer;
  v_target_count integer;
  v_n integer;
  v_penalty_date date;
begin
  select daily_credit, punishment_overdue_days, punishment_overdue_penalty
    into v_daily_credit, v_overdue_days, v_overdue_penalty
    from public.app_settings;

  select coalesce(max(day), v_today - 1) + 1 into v_start_day from public.daily_rollover_log;

  v_day := v_start_day;
  while v_day <= v_today loop
    if not exists (select 1 from public.daily_rollover_log where day = v_day) then
      insert into public.ledger_entries (entry_date, entry_type, amount, description)
      values (v_day, 'daily_credit', v_daily_credit, 'Daily credit')
      on conflict do nothing;
      insert into public.daily_rollover_log (day) values (v_day) on conflict do nothing;
      v_credits_posted := v_credits_posted + 1;
    end if;
    v_day := v_day + 1;
  end loop;

  update public.app_settings set last_rollover_date = v_today;

  for v_punishment in select * from public.punishments where status = 'open' loop
    v_days_open := v_today - v_punishment.assigned_date + 1;
    v_target_count := v_days_open / v_overdue_days; -- integer division
    v_n := v_punishment.penalty_count;
    while v_n < v_target_count loop
      v_n := v_n + 1;
      v_penalty_date := v_punishment.assigned_date + (v_overdue_days * v_n - 1);
      insert into public.ledger_entries (entry_date, entry_type, amount, person_id, source_table, source_id, description)
      values (v_penalty_date, 'punishment_overdue', -v_overdue_penalty, v_punishment.person_id, 'punishments', v_punishment.id,
        format('Punishment overdue (period %s)', v_n));
      v_penalties_posted := v_penalties_posted + 1;
    end loop;
    if v_n <> v_punishment.penalty_count then
      update public.punishments set penalty_count = v_n where id = v_punishment.id;
    end if;
  end loop;

  return jsonb_build_object('asof', v_today, 'credits_posted', v_credits_posted, 'penalties_posted', v_penalties_posted);
end;
$$;

-- ---------------------------------------------------------------------------
-- grants: authenticated app users may call the RPCs; anon gets nothing.
-- Direct table DML stays ungranted (writes only happen via these functions).
-- ---------------------------------------------------------------------------
revoke all on function public.fn_run_daily_rollover(date) from public, authenticated;
grant execute on function public.fn_run_daily_rollover(date) to service_role;

grant execute on function
  public.fn_today(),
  public.fn_get_balance(),
  public.fn_toggle_move_ring(uuid, date, boolean),
  public.fn_log_workout(uuid, date, integer),
  public.fn_claim_badge(uuid, date),
  public.fn_log_call(date, numeric, boolean, boolean, boolean),
  public.fn_edit_call(uuid, numeric, boolean, boolean),
  public.fn_delete_call(uuid),
  public.fn_dispute_call(uuid, text),
  public.fn_log_punishment_attempt(uuid, integer, text)
  to authenticated;
