-- Payroll Master auto-generated earnings are always stored as whole rupees.
-- This changes no master row, payroll run, or payslip snapshot; it only makes
-- future auto-calculations consistent across policy versions.
update public."HRMS_private_payroll_policy_versions"
set private_config = coalesce(private_config, '{}'::jsonb) || jsonb_build_object('roundMasterComponents', true),
    updated_at = now();
