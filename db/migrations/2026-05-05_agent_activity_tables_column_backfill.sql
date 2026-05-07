-- Backfill the other agent tables from 2026-04-30 when an older `CREATE TABLE IF NOT EXISTS`
-- run left incomplete column sets (same PGRST204 class of errors as screenshots).

-- HRMS_attendance_state (7 columns incl. id)
alter table if exists public."HRMS_attendance_state"
  add column if not exists company_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists attendance_log_id uuid references public."HRMS_attendance_logs"(id) on delete set null,
  add column if not exists work_date date not null default current_date,
  add column if not exists status text not null default 'INACTIVE',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists hrms_attendance_state_company_employee_idx
  on public."HRMS_attendance_state"(company_id, employee_id);

-- HRMS_agent_heartbeat
alter table if exists public."HRMS_agent_heartbeat"
  add column if not exists company_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists attendance_log_id uuid,
  add column if not exists status text not null default 'ONLINE',
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists app_version text,
  add column if not exists device_name text;

create index if not exists hrms_agent_heartbeat_company_employee_idx
  on public."HRMS_agent_heartbeat"(company_id, employee_id);

create index if not exists hrms_agent_heartbeat_last_seen_idx
  on public."HRMS_agent_heartbeat"(company_id, last_seen_at desc);

-- HRMS_activity_sessions
alter table if exists public."HRMS_activity_sessions"
  add column if not exists company_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists attendance_log_id uuid references public."HRMS_attendance_logs"(id) on delete set null,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists ended_at timestamptz,
  add column if not exists active_seconds int default 0,
  add column if not exists idle_seconds int default 0,
  add column if not exists source text default 'desktop_agent',
  add column if not exists created_at timestamptz default now();

create index if not exists hrms_activity_sessions_company_employee_idx
  on public."HRMS_activity_sessions"(company_id, employee_id, started_at desc);
