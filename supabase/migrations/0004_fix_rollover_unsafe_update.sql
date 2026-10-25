-- fn_run_daily_rollover's "update app_settings set last_rollover_date = ..."
-- had no WHERE clause. Postgres's statement-level safety check on this
-- project's service_role/PostgREST connection (not on direct superuser SQL
-- Editor sessions) rejects any UPDATE without a WHERE clause, so every call
-- made through the rollover Edge Function (i.e. the real cron path) failed
-- with "UPDATE requires a WHERE clause" and rolled back the whole call —
-- even though the same function worked fine when run by hand in the SQL
-- Editor. Fix: scope it to the singleton row, same pattern used everywhere
-- else in this file.

create or replace function public.fn_run_daily_rollover(p_asof date default null)
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

  update public.app_settings set last_rollover_date = v_today where id = true;

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
