-- Daily 90-day retention cron for desktop-agent activity records.
--
-- Runs once a day at 02:15 UTC (07:45 IST) and POSTs to the deployed
-- `purge-old-activity` edge function. The edge function:
--   1. Calls public.purge_old_activity_summarize(<today - 90>) to freeze
--      session totals onto HRMS_attendance_logs.
--   2. Deletes the storage objects (Azure Blob via SAS DELETE,
--      Supabase Storage via storage.remove()) for screenshots older
--      than the cutoff.
--   3. Deletes the screenshot/session/state rows themselves.
--
-- Authentication
-- --------------
-- The edge function is deployed with default JWT verification, so the
-- cron must send the project's `service_role` key in the
-- `Authorization` header. There is no separate "purge secret" anywhere.
--
-- Run this script as a Supabase project owner (Dashboard → SQL Editor
-- works). Replace the placeholders before executing:
--     <project-ref>            e.g. fvveqziyusjgqejowkfp
--     <SUPABASE_SERVICE_ROLE>  the project's service_role JWT
--                              (Project Settings → API → service_role)

-- 0. Make sure pg_cron + pg_net are available.
--    On Supabase these create the `cron` and `net` schemas the rest of
--    the script depends on. Safe to re-run.
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

-- 1. Drop any earlier copy of the job so re-running this script is safe.
do $$
begin
  if exists (
    select 1
      from pg_namespace n
      join pg_class c on c.relnamespace = n.oid
     where n.nspname = 'cron'
       and c.relname = 'job'
  ) then
    if exists (select 1 from cron.job where jobname = 'purge-old-activity-daily') then
      perform cron.unschedule('purge-old-activity-daily');
    end if;
  end if;
end
$$;

-- 2. Schedule the daily retention call.
select cron.schedule(
  'purge-old-activity-daily',
  '15 2 * * *',  -- every day at 02:15 UTC
  $cron$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/purge-old-activity',
    headers := jsonb_build_object(
      'content-type',  'application/json',
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE>'
    ),
    body := jsonb_build_object(
      'triggered_by', 'pg_cron',
      'job_name',     'purge-old-activity-daily'
    ),
    timeout_milliseconds := 600000
  );
  $cron$
);

-- 3. (Optional) Verify the job is registered.
-- select jobid, schedule, command from cron.job where jobname = 'purge-old-activity-daily';

-- 4. (Optional) Inspect recent runs / responses.
-- select * from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'purge-old-activity-daily')
--  order by start_time desc limit 10;
-- select * from net._http_response order by created desc limit 10;
