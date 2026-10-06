-- September Excel derives employer ESIC from the already rounded employee ESIC:
-- employee_esic / 0.75% * 3.25%, then rounded to whole rupees.
-- This changes only the effective-dated calculation policy, never payroll
-- masters, payroll runs, or payslip snapshots.
update public."HRMS_private_payroll_policy_versions"
set private_config = coalesce(private_config, '{}'::jsonb) || jsonb_build_object('esicEmployerFromEmployeeEsic', true),
    updated_at = now()
where effective_from = date '2026-09-01';
