-- Per-employee leave balance adjustments (HR manual credits/debits with audit trail).
-- Applied in balance computation: remaining = entitled - used + sum(adjustment_days).

create table if not exists public."HRMS_leave_balance_adjustments" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  employee_user_id uuid not null references public."HRMS_users"(id) on delete cascade,
  leave_type_id uuid not null,
  adjustment_days numeric not null,
  effective_from date not null default (current_date),
  reason text not null,
  created_by uuid references public."HRMS_users"(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hrms_leave_balance_adjustments_days_nonzero check (adjustment_days <> 0)
);

create index if not exists hrms_leave_balance_adj_company_employee_idx
  on public."HRMS_leave_balance_adjustments" (company_id, employee_user_id);

create index if not exists hrms_leave_balance_adj_company_type_idx
  on public."HRMS_leave_balance_adjustments" (company_id, leave_type_id);

comment on table public."HRMS_leave_balance_adjustments" is
  'Manual per-employee leave balance adjustments. Positive = credit days; negative = debit days.';
