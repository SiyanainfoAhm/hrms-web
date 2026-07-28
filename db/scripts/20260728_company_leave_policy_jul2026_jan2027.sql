-- Optional company-specific leave policy transition.
-- Replace :company_id with the target company's UUID before running.
-- Does NOT rewrite or delete historical leave_requests.
--
-- Period A (existing open policy): closed to 2026-06-30
-- Period B: 2026-07-01 → 2026-12-31  CL=3, SL=3, PL=0 (requests blocked)
-- Period C: from 2027-01-01         CL=6, SL=6, PL=0 (requests blocked)
--
-- Other companies are untouched (filter by company_id).

-- Example:
-- \set company_id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

do $$
declare
  v_company uuid := null; -- set explicitly: 'uuid-here'::uuid
  v_cl uuid;
  v_sl uuid;
  v_pl uuid;
begin
  if v_company is null then
    raise exception 'Set v_company to the target company UUID before running';
  end if;

  select id into v_cl from public."HRMS_leave_types"
    where company_id = v_company and upper(coalesce(code, '')) = 'CL' limit 1;
  select id into v_sl from public."HRMS_leave_types"
    where company_id = v_company and upper(coalesce(code, '')) = 'SL' limit 1;
  select id into v_pl from public."HRMS_leave_types"
    where company_id = v_company and upper(coalesce(code, '')) = 'PL' limit 1;

  if v_cl is null then
    insert into public."HRMS_leave_types"(company_id, name, code, is_paid, payslip_slot)
    values (v_company, 'Casual Leave', 'CL', true, 'CL')
    returning id into v_cl;
  end if;

  -- Close currently open versions for CL/SL/PL as of day before 2026-07-01
  update public."HRMS_leave_policies"
  set effective_to = date '2026-06-30', updated_at = now()
  where company_id = v_company
    and leave_type_id in (v_cl, v_sl, v_pl)
    and effective_to is null
    and effective_from < date '2026-07-01';

  -- Jul–Dec 2026
  insert into public."HRMS_leave_policies"(
    company_id, leave_type_id, accrual_method, monthly_accrual_rate, annual_quota,
    prorate_on_join, reset_month, reset_day, allow_carryover, carryover_limit,
    effective_from, effective_to, request_enabled
  ) values
    (v_company, v_cl, 'annual', null, 3, false, 1, 1, false, null, '2026-07-01', '2026-12-31', true),
    (v_company, v_sl, 'annual', null, 3, false, 1, 1, false, null, '2026-07-01', '2026-12-31', true),
    (v_company, v_pl, 'annual', null, 0, false, 1, 1, false, null, '2026-07-01', null, false);

  -- From Jan 2027 (CL/SL). PL already open-ended at 0 from Jul 2026.
  insert into public."HRMS_leave_policies"(
    company_id, leave_type_id, accrual_method, monthly_accrual_rate, annual_quota,
    prorate_on_join, reset_month, reset_day, allow_carryover, carryover_limit,
    effective_from, effective_to, request_enabled
  ) values
    (v_company, v_cl, 'annual', null, 6, false, 1, 1, false, null, '2027-01-01', null, true),
    (v_company, v_sl, 'annual', null, 6, false, 1, 1, false, null, '2027-01-01', null, true);
end $$;
