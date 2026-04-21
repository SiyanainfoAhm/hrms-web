-- Company-level payroll configuration storage (private payroll config JSON).
-- Run in Supabase SQL editor.

create table if not exists "HRMS_company_payroll_config" (
  company_id uuid primary key references "HRMS_companies"(id) on delete cascade,
  private_config jsonb,
  updated_by uuid references "HRMS_users"(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists "hrms_company_payroll_config_updated_at_idx"
  on "HRMS_company_payroll_config"(updated_at desc);

