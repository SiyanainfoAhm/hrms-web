-- Cumulative desktop-agent idle minutes for the day (keyboard/mouse), updated by the attendance agent.

alter table if exists public."HRMS_attendance_logs"
  add column if not exists agent_idle_minutes integer not null default 0;

comment on column public."HRMS_attendance_logs".agent_idle_minutes is
  'Minutes of desktop idle (agent-tracked) while punched in; persisted for reload across devices/sessions.';
