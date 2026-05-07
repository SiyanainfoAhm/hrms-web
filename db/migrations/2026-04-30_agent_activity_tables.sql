-- Background attendance agent support tables.
-- NOTE: This migration does NOT modify existing `HRMS_attendance_logs`.
-- Screenshots: company bucket (typically `photomedia`); desktop agent path: `HRMS/attendance screenshots/{company_id}/{Mon_yyyy}/{yyyy-mm-dd}/{employee}/...`.

create table if not exists public."HRMS_attendance_state" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  attendance_log_id uuid references public."HRMS_attendance_logs"(id) on delete set null,
  work_date date not null default current_date,
  status text not null check (status in ('ACTIVE','LUNCH','BREAK','INACTIVE')),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id)
);

create index if not exists hrms_attendance_state_company_employee_idx
  on public."HRMS_attendance_state"(company_id, employee_id);

create table if not exists public."HRMS_agent_heartbeat" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  attendance_log_id uuid,
  status text not null default 'ONLINE',
  last_seen_at timestamptz not null default now(),
  app_version text,
  device_name text,
  unique (company_id, employee_id)
);

create index if not exists hrms_agent_heartbeat_company_employee_idx
  on public."HRMS_agent_heartbeat"(company_id, employee_id);

create index if not exists hrms_agent_heartbeat_last_seen_idx
  on public."HRMS_agent_heartbeat"(company_id, last_seen_at desc);

create table if not exists public."HRMS_activity_sessions" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  attendance_log_id uuid references public."HRMS_attendance_logs"(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_seconds int default 0,
  idle_seconds int default 0,
  source text default 'desktop_agent',
  created_at timestamptz default now()
);

create index if not exists hrms_activity_sessions_company_employee_idx
  on public."HRMS_activity_sessions"(company_id, employee_id, started_at desc);

create table if not exists public."HRMS_activity_screenshots" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_id uuid not null,
  attendance_log_id uuid references public."HRMS_attendance_logs"(id) on delete set null,
  captured_at timestamptz not null default now(),
  trigger_type text not null default 'interval',
  storage_bucket text not null default 'photomedia',
  storage_path text not null,
  app_name text,
  window_title text,
  mouse_active boolean default false,
  keyboard_active boolean default false,
  idle_seconds int default 0,
  created_at timestamptz not null default now()
);

create index if not exists hrms_activity_screenshots_company_employee_idx
  on public."HRMS_activity_screenshots"(company_id, employee_id, captured_at desc);

