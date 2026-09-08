-- Payroll payable-days snapshot, stale detection, and recalculation audit.
-- Does not rewrite existing pay_days values.

alter table if exists public."HRMS_payslips"
  add column if not exists payable_days_breakdown jsonb;

alter table if exists public."HRMS_payslips"
  add column if not exists recalculation_required boolean not null default false;

alter table if exists public."HRMS_payslips"
  add column if not exists recalculation_reason text;

alter table if exists public."HRMS_payslips"
  add column if not exists source_changed_at timestamptz;

alter table if exists public."HRMS_payslips"
  add column if not exists source_changed_by uuid;

alter table if exists public."HRMS_payslips"
  add column if not exists source_change_summary text;

alter table if exists public."HRMS_payslips"
  add column if not exists last_recalculated_at timestamptz;

alter table if exists public."HRMS_payslips"
  add column if not exists last_recalculated_by uuid;

alter table if exists public."HRMS_payslips"
  add column if not exists payroll_status text not null default 'generated';

comment on column public."HRMS_payslips".payable_days_breakdown is
  'Calendar/working-day/leave breakdown used to compute pay_days.';
comment on column public."HRMS_payslips".recalculation_required is
  'True when attendance, leave, holiday or employee data changed after generation.';
comment on column public."HRMS_payslips".payroll_status is
  'generated | approved | finalized | paid. Locked payroll periods are treated as finalized.';

create table if not exists public."HRMS_payroll_recalc_audit" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  payroll_period_id uuid not null,
  payslip_id uuid,
  employee_user_id uuid not null,
  action text not null,
  reason text,
  actor_user_id uuid,
  old_breakdown jsonb,
  new_breakdown jsonb,
  changed_source_records jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hrms_payroll_recalc_audit_period_idx
  on public."HRMS_payroll_recalc_audit" (payroll_period_id, created_at desc);

create index if not exists hrms_payslips_recalc_required_idx
  on public."HRMS_payslips" (payroll_period_id)
  where recalculation_required = true;

alter table public."HRMS_payroll_recalc_audit" enable row level security;
alter table public."HRMS_payroll_recalc_audit" disable row level security;
