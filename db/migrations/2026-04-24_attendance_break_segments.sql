-- Store multiple lunch/tea break intervals (out->in pairs) per attendance row.
-- This prevents "first out to last in" being treated as one long break.
--
-- Run in Supabase SQL editor (or your migration runner).

alter table "HRMS_attendance_logs"
  add column if not exists "lunch_break_segments" jsonb not null default '[]'::jsonb;

alter table "HRMS_attendance_logs"
  add column if not exists "tea_break_segments" jsonb not null default '[]'::jsonb;

