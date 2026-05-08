-- 90-day retention plumbing for desktop-agent activity records.
--
-- Goals
--  1. Keep `HRMS_attendance_logs` rows forever (presence + active time per
--     day is part of the official record).
--  2. After 90 days, drop the heavy sidecar data the agent produces:
--       - `HRMS_activity_screenshots` rows + the underlying Azure / Supabase
--         storage objects
--       - `HRMS_activity_sessions` rows (per-heartbeat timing slices)
--       - `HRMS_attendance_state` rows that point at attendance logs older
--         than the cutoff
--  3. Before deleting `HRMS_activity_sessions`, fold the per-day totals
--     (active / idle / disconnected seconds) onto `HRMS_attendance_logs`
--     so the attendance page can keep rendering the same active-time
--     numbers for historical days.
--
-- This migration adds the persisted summary columns and a SQL helper
-- (`purge_old_activity_summarize`) that the daily edge function calls
-- before it removes screenshots/sessions/state.

-- 1. Persisted summary columns on the attendance log itself.
alter table if exists public."HRMS_attendance_logs"
  add column if not exists agent_active_minutes        integer not null default 0,
  add column if not exists agent_disconnected_minutes  integer not null default 0,
  add column if not exists activity_purged_at          timestamptz;

comment on column public."HRMS_attendance_logs".agent_active_minutes is
  'Cumulative agent-tracked active minutes. Populated continuously by the desktop agent and frozen at retention cutoff so the value survives session pruning.';
comment on column public."HRMS_attendance_logs".agent_disconnected_minutes is
  'Cumulative agent-disconnected minutes (excluding break windows) for the day. Frozen at retention cutoff.';
comment on column public."HRMS_attendance_logs".activity_purged_at is
  'When the per-log activity_sessions / screenshots were purged. NULL means raw rows are still available.';

create index if not exists hrms_attendance_logs_activity_purged_at_idx
  on public."HRMS_attendance_logs"(activity_purged_at);

-- 2. Helper that aggregates session totals onto the attendance log row.
--    Only touches logs whose work_date is strictly before `cutoff_date`
--    AND that have not yet been frozen. Returns the number of logs it
--    updated so the caller can log/observe.
create or replace function public.purge_old_activity_summarize(cutoff_date date)
returns integer
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  with agg as (
    select
      attendance_log_id                                          as log_id,
      coalesce(sum(active_seconds), 0)::integer                  as active_seconds_total,
      coalesce(sum(idle_seconds), 0)::integer                    as idle_seconds_total,
      coalesce(sum(disconnected_seconds), 0)::integer            as disc_seconds_total
    from public."HRMS_activity_sessions"
    where attendance_log_id is not null
    group by attendance_log_id
  )
  update public."HRMS_attendance_logs" l
  set
    -- Use GREATEST so a partial freeze (e.g. agent already wrote the live
    -- counter) is never reduced by the aggregate.
    agent_active_minutes = greatest(
      coalesce(l.agent_active_minutes, 0),
      floor(a.active_seconds_total / 60.0)::int
    ),
    agent_idle_minutes = greatest(
      coalesce(l.agent_idle_minutes, 0),
      floor(a.idle_seconds_total / 60.0)::int
    ),
    agent_disconnected_minutes = greatest(
      coalesce(l.agent_disconnected_minutes, 0),
      floor(a.disc_seconds_total / 60.0)::int
    ),
    activity_purged_at = now()
  from agg a
  where l.id = a.log_id
    and l.work_date < cutoff_date
    and l.activity_purged_at is null;

  get diagnostics affected = row_count;

  -- Logs older than the cutoff that simply have no sessions still need
  -- to be marked frozen so the API switches to the persisted-columns
  -- branch and we don't keep retrying.
  update public."HRMS_attendance_logs" l
  set activity_purged_at = now()
  where l.work_date < cutoff_date
    and l.activity_purged_at is null
    and not exists (
      select 1 from public."HRMS_activity_sessions" s
      where s.attendance_log_id = l.id
    );

  return affected;
end;
$$;

revoke all on function public.purge_old_activity_summarize(date) from public;
grant execute on function public.purge_old_activity_summarize(date) to service_role;
