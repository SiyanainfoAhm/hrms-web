-- Align default bucket with hrms-web / desktop agent (photomedia + HRMS/... paths).
alter table if exists public."HRMS_activity_screenshots"
  alter column storage_bucket set default 'photomedia';
