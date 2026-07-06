-- Diagnose Paid Leave balance vs paid/unpaid split for an employee (e.g. Devenkumar Patel).
-- Run in Supabase SQL editor. Edit employee_name_filter and as_of_date as needed.
--
-- Why payroll may show UNPAID leave even when June usage looks small:
--   1. paid_days / unpaid_days are stored on HRMS_leave_requests at booking/approval time.
--   2. Balance is per LEAVE YEAR (policy reset month), not calendar month — earlier months count.
--   3. If balance was 0 when the row was created, 0.5 day can be stored as unpaid_days = 0.5.
--   4. Approval used to NOT recalculate paid/unpaid (fixed in app — re-approve or run fix section below).

WITH params AS (
  SELECT
    '%Deven%'::text AS employee_name_filter,  -- partial name match
    '2026-06-18'::date AS as_of_date,         -- leave date or payroll as-of
    2026::int AS june_year,
    6::int AS june_month
),
employee AS (
  SELECT
    u.id AS user_id,
    u.company_id,
    u.name,
    u.email,
    u.date_of_joining::date AS date_of_joining
  FROM public."HRMS_users" u
  CROSS JOIN params p
  WHERE u.name ILIKE p.employee_name_filter
  LIMIT 5
),

-- Paid Leave type + policy (adjust code filter if your PL code differs)
leave_type_policy AS (
  SELECT
    e.user_id,
    e.name AS employee_name,
    lt.id AS leave_type_id,
    lt.name AS leave_type_name,
    lt.code AS leave_type_code,
    lp.accrual_method,
    lp.monthly_accrual_rate,
    lp.annual_quota,
    lp.prorate_on_join,
    lp.reset_month,
    lp.reset_day
  FROM employee e
  JOIN public."HRMS_leave_types" lt ON lt.company_id = e.company_id
  JOIN public."HRMS_leave_policies" lp ON lp.leave_type_id = lt.id AND lp.company_id = e.company_id
  WHERE lt.is_paid = true
    AND (lt.name ILIKE '%paid%' OR lt.code ILIKE '%PL%' OR lt.code ILIKE '%EL%')
),

-- Leave year start for as_of_date (same idea as leaveYearStart in app)
leave_year AS (
  SELECT
    ltp.*,
    p.as_of_date,
    make_date(
      CASE
        WHEN make_date(EXTRACT(YEAR FROM p.as_of_date)::int, ltp.reset_month, LEAST(ltp.reset_day, 28))
             <= p.as_of_date
        THEN EXTRACT(YEAR FROM p.as_of_date)::int
        ELSE EXTRACT(YEAR FROM p.as_of_date)::int - 1
      END,
      ltp.reset_month,
      LEAST(ltp.reset_day, 28)
    ) AS year_start,
    GREATEST(
      make_date(
        CASE
          WHEN make_date(EXTRACT(YEAR FROM p.as_of_date)::int, ltp.reset_month, LEAST(ltp.reset_day, 28))
               <= p.as_of_date
          THEN EXTRACT(YEAR FROM p.as_of_date)::int
          ELSE EXTRACT(YEAR FROM p.as_of_date)::int - 1
        END,
        ltp.reset_month,
        LEAST(ltp.reset_day, 28)
      ),
      CASE WHEN ltp.prorate_on_join AND e.date_of_joining IS NOT NULL THEN e.date_of_joining ELSE DATE '1900-01-01' END
    ) AS accrual_start
  FROM leave_type_policy ltp
  JOIN employee e ON e.user_id = ltp.user_id
  CROSS JOIN params p
),

entitlement AS (
  SELECT
    ly.*,
    CASE
      WHEN ly.accrual_method = 'monthly' THEN
        (
          (EXTRACT(YEAR FROM ly.as_of_date)::int - EXTRACT(YEAR FROM ly.accrual_start)::int) * 12
          + (EXTRACT(MONTH FROM ly.as_of_date)::int - EXTRACT(MONTH FROM ly.accrual_start)::int)
          + 1
        )::numeric * COALESCE(ly.monthly_accrual_rate, 0)
      WHEN ly.accrual_method = 'annual' THEN COALESCE(ly.annual_quota, 0)::numeric
      ELSE NULL
    END AS entitled_raw,
    CASE
      WHEN ly.accrual_method = 'none' THEN NULL
      WHEN ly.accrual_method = 'monthly' AND ly.annual_quota IS NOT NULL THEN
        LEAST(
          (
            (EXTRACT(YEAR FROM ly.as_of_date)::int - EXTRACT(YEAR FROM ly.accrual_start)::int) * 12
            + (EXTRACT(MONTH FROM ly.as_of_date)::int - EXTRACT(MONTH FROM ly.accrual_start)::int)
            + 1
          )::numeric * COALESCE(ly.monthly_accrual_rate, 0),
          ly.annual_quota::numeric
        )
      WHEN ly.accrual_method = 'monthly' THEN
        (
          (EXTRACT(YEAR FROM ly.as_of_date)::int - EXTRACT(YEAR FROM ly.accrual_start)::int) * 12
          + (EXTRACT(MONTH FROM ly.as_of_date)::int - EXTRACT(MONTH FROM ly.accrual_start)::int)
          + 1
        )::numeric * COALESCE(ly.monthly_accrual_rate, 0)
      ELSE COALESCE(ly.annual_quota, 0)::numeric
    END AS entitled_as_of
  FROM leave_year ly
),

approved_usage AS (
  SELECT
    ent.user_id,
    ent.leave_type_id,
    ent.leave_type_name,
    ent.as_of_date,
    ent.year_start,
    ent.accrual_method,
    ent.monthly_accrual_rate,
    ent.entitled_as_of,
    lr.id AS leave_request_id,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lr.paid_days AS stored_paid_days,
    lr.unpaid_days AS stored_unpaid_days,
    lr.status,
    CASE
      WHEN lr.start_date > ent.as_of_date THEN 0
      WHEN lr.end_date < ent.year_start THEN 0
      ELSE lr.total_days::numeric  -- app uses total_days units in leave year window
    END AS used_in_leave_year
  FROM entitlement ent
  JOIN public."HRMS_leave_requests" lr
    ON lr.employee_user_id = ent.user_id
   AND lr.leave_type_id = ent.leave_type_id
   AND lr.status = 'approved'
   AND lr.end_date >= ent.year_start
   AND lr.start_date <= ent.as_of_date
),

summary AS (
  SELECT
    ent.user_id,
    ent.employee_name,
    ent.leave_type_name,
    ent.leave_type_code,
    ent.accrual_method,
    ent.monthly_accrual_rate,
    ent.annual_quota,
    ent.year_start,
    ent.as_of_date,
    ent.entitled_as_of,
    COALESCE(SUM(au.used_in_leave_year), 0) AS used_in_leave_year,
    GREATEST(0, ent.entitled_as_of - COALESCE(SUM(au.used_in_leave_year), 0)) AS remaining_as_of
  FROM entitlement ent
  LEFT JOIN approved_usage au ON au.user_id = ent.user_id AND au.leave_type_id = ent.leave_type_id
  GROUP BY
    ent.user_id, ent.employee_name, ent.leave_type_name, ent.leave_type_code,
    ent.accrual_method, ent.monthly_accrual_rate, ent.annual_quota,
    ent.year_start, ent.as_of_date, ent.entitled_as_of
)

-- A) Balance summary as of 18-Jun-2026
SELECT 'balance_summary' AS section, s.*
FROM summary s;

-- B) All approved PL rows in leave year + stored paid/unpaid (run separately if editor allows one result)
WITH params AS (
  SELECT '%Deven%'::text AS employee_name_filter, '2026-06-18'::date AS as_of_date
),
employee AS (
  SELECT u.id AS user_id, u.company_id, u.name
  FROM public."HRMS_users" u
  CROSS JOIN params p
  WHERE u.name ILIKE p.employee_name_filter
  LIMIT 5
)
SELECT
  'leave_rows' AS section,
  u.name AS employee_name,
  lt.name AS leave_type,
  lr.start_date,
  lr.end_date,
  lr.total_days,
  lr.paid_days,
  lr.unpaid_days,
  lr.status,
  lr.created_at,
  lr.approved_at,
  CASE
    WHEN lr.start_date >= make_date(2026, 6, 1) AND lr.end_date <= make_date(2026, 6, 30)
    THEN 'In June 2026'
    ELSE 'Outside June 2026'
  END AS june_flag
FROM employee u
JOIN public."HRMS_leave_requests" lr ON lr.employee_user_id = u.user_id
JOIN public."HRMS_leave_types" lt ON lt.id = lr.leave_type_id
WHERE lr.status IN ('approved', 'pending')
ORDER BY lr.start_date;

-- C) Fix stale paid/unpaid for a specific approved row (ONLY after verifying remaining balance)
-- Example: if remaining >= 0.5 but row has unpaid_days = 0.5, set paid_days = 0.5, unpaid_days = 0
--
-- UPDATE public."HRMS_leave_requests" lr
-- SET paid_days = 0.5, unpaid_days = 0
-- WHERE lr.id = '<leave-request-uuid>'
--   AND lr.status = 'approved';
