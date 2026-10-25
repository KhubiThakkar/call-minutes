-- fn_toggle_move_ring, fn_log_workout, and fn_claim_badge all accepted an
-- arbitrary p_person_id with no check that the caller (v_actor) actually
-- was that person — so either partner could tick/untick the other's move
-- ring, log a workout on their behalf, or claim their weekly badge. These
-- are SECURITY DEFINER RPCs granted to `authenticated`, so the enforcement
-- has to live here, not just in the UI. Both partners should still be able
-- to *see* each other's entries (plain select policies are unaffected) —
-- only the mutating RPCs are restricted to self.

create or replace function public.fn_toggle_move_ring(p_person_id uuid, p_day date, p_ticked boolean)
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
  if p_person_id <> v_actor then
    raise exception 'you can only edit your own move ring' using errcode = '42501';
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

create or replace function public.fn_log_workout(p_person_id uuid, p_day date, p_duration_minutes integer)
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
  if p_person_id <> v_actor then
    raise exception 'you can only log your own workout' using errcode = '42501';
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

create or replace function public.fn_claim_badge(p_person_id uuid, p_week_start date)
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
  if p_person_id <> v_actor then
    raise exception 'you can only claim your own badge' using errcode = '42501';
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
