-- Cascade-delete agent sidecar rows when an attendance log is deleted.
--
-- Goal:
-- When a row in public."HRMS_attendance_logs" is deleted, remove all related:
-- - public."HRMS_activity_screenshots"
-- - public."HRMS_activity_sessions"
-- - public."HRMS_attendance_state"
--
-- NOTE:
-- We only cascade for rows that reference the deleted attendance_log_id.
-- Rows with attendance_log_id = NULL are unaffected.

-- HRMS_activity_screenshots.attendance_log_id -> HRMS_attendance_logs(id)
alter table if exists public."HRMS_activity_screenshots"
  drop constraint if exists "HRMS_activity_screenshots_attendance_log_id_fkey";

alter table if exists public."HRMS_activity_screenshots"
  add constraint "HRMS_activity_screenshots_attendance_log_id_fkey"
  foreign key (attendance_log_id)
  references public."HRMS_attendance_logs"(id)
  on delete cascade;

-- HRMS_activity_sessions.attendance_log_id -> HRMS_attendance_logs(id)
alter table if exists public."HRMS_activity_sessions"
  drop constraint if exists "HRMS_activity_sessions_attendance_log_id_fkey";

alter table if exists public."HRMS_activity_sessions"
  add constraint "HRMS_activity_sessions_attendance_log_id_fkey"
  foreign key (attendance_log_id)
  references public."HRMS_attendance_logs"(id)
  on delete cascade;

-- HRMS_attendance_state.attendance_log_id -> HRMS_attendance_logs(id)
alter table if exists public."HRMS_attendance_state"
  drop constraint if exists "HRMS_attendance_state_attendance_log_id_fkey";

alter table if exists public."HRMS_attendance_state"
  add constraint "HRMS_attendance_state_attendance_log_id_fkey"
  foreign key (attendance_log_id)
  references public."HRMS_attendance_logs"(id)
  on delete cascade;

