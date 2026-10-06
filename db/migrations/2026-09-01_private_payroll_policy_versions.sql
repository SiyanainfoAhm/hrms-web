-- Effective-dated private payroll calculation policies.  This deliberately does
-- not update payroll masters, payroll runs, or payslips: those are history.
create table if not exists public."HRMS_private_payroll_policy_versions" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."HRMS_companies"(id) on delete cascade,
  effective_from date not null,
  effective_to date null,
  private_config jsonb not null,
  created_by uuid null references public."HRMS_users"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists hrms_private_payroll_policy_versions_lookup_idx
  on public."HRMS_private_payroll_policy_versions" (company_id, effective_from desc);

-- Seed only the new policy. Existing single-record config remains the legacy
-- fallback for periods before this date, so no historic setting is overwritten.
insert into public."HRMS_private_payroll_policy_versions"
  (company_id, effective_from, effective_to, private_config)
select c.id, date '2026-09-01', null,
  coalesce(pc.private_config, '{}'::jsonb) || jsonb_build_object(
    'breakupPct', jsonb_build_object('basicPct', 0.5, 'hraPct', 0, 'medicalPct', 0, 'transPct', 0, 'ltaPct', 0, 'personalPct', 0),
    'hraRateOnBasicDa', 0.4, 'hraZeroWhenPotentialHraBelow', 6000,
    'basicDaFloorWhenHalfGrossLow', 14290, 'advanceBonusRateOnBasic', 0.0833, 'roundMasterComponents', true,
    'esicEmployerFromEmployeeEsic', true,
    'payslipEarningsMode', 'basic_hra_advance_special', 'payslipEarningsEffectiveFromYm', '2026-09'
  )
from public."HRMS_companies" c
left join public."HRMS_company_payroll_config" pc on pc.company_id = c.id
on conflict (company_id, effective_from) do nothing;
