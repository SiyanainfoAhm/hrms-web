-- Backfill `HRMS_activity_screenshots` to match 2026-04-30_agent_activity_tables.sql
--
-- Canonical table has 14 columns (including `id`). If the table was created from an
-- older script, `CREATE TABLE IF NOT EXISTS` leaves missing columns; PostgREST then
-- errors (e.g. PGRST204 on storage_bucket, idle_seconds).
--
-- Assumes `id` already exists (primary key). All other columns are added if missing.

alter table if exists public."HRMS_activity_screenshots"
  add column if not exists company_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists attendance_log_id uuid,
  add column if not exists captured_at timestamptz not null default now(),
  add column if not exists trigger_type text not null default 'interval',
  add column if not exists storage_bucket text not null default 'photomedia',
  add column if not exists storage_path text not null default '',
  add column if not exists app_name text,
  add column if not exists window_title text,
  add column if not exists mouse_active boolean default false,
  add column if not exists keyboard_active boolean default false,
  add column if not exists idle_seconds int default 0,
  add column if not exists created_at timestamptz not null default now();

create index if not exists hrms_activity_screenshots_company_employee_idx
  on public."HRMS_activity_screenshots"(company_id, employee_id, captured_at desc);
