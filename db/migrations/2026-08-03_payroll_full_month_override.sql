-- Payroll: allow selected employees to be paid for full calendar month days
-- without using attendance-driven pay-day calculation.
-- Stored on HRMS_users because payroll masters/users may exist without an HRMS_employees row.
-- Attendance tracking itself is unchanged.

alter table if exists public."HRMS_users"
  add column if not exists payroll_full_month_override boolean not null default false;

alter table if exists public."HRMS_users"
  add column if not exists payroll_full_month_override_reason text;

comment on column public."HRMS_users".payroll_full_month_override is
  'When true, Run Payroll uses full calendar days in month as pay days (bypasses attendance-based pay-day calc).';

comment on column public."HRMS_users".payroll_full_month_override_reason is
  'Optional note explaining why full-month payroll override is enabled.';
