-- June payroll review: pending leaves + attendance present credit.
--
-- Payroll rule (matches src/app/api/payroll/run/route.ts):
--   • Gross hours ≥ 9  → 1 attendance day
--   • Gross hours > 4 and < 9 → 0.5 attendance day
--   • Gross hours ≤ 4 → 0
--   • Weekends/holidays/paid leave are counted separately in payroll; this script flags weekdays only.
--
-- Edit the params CTE below, then run each section in Supabase SQL editor.

-- =============================================================================
-- A) Pending leave requests overlapping June payroll window
-- =============================================================================
WITH params AS (
  SELECT
    2026::int AS payroll_year,
    6::int AS payroll_month,
    30::int AS run_through_day,           -- e.g. 12 for mid-month run through 12-Jun
    NULL::uuid AS company_id_filter       -- set to your company UUID or leave NULL for all
),
period AS (
  SELECT
    make_date(p.payroll_year, p.payroll_month, 1) AS period_start,
    make_date(
      p.payroll_year,
      p.payroll_month,
      LEAST(
        p.run_through_day,
        EXTRACT(DAY FROM (make_date(p.payroll_year, p.payroll_month, 1) + interval '1 month - 1 day'))::int
      )
    ) AS period_end,
    p.company_id_filter
  FROM params p
)
SELECT
  lr.company_id,
  lr.id AS leave_request_id,
  lr.employee_user_id,
  u.name AS employee_name,
  u.email AS employee_email,
  e.employee_code,
  lt.name AS leave_type_name,
  lt.code AS leave_type_code,
  lt.is_paid,
  lr.status,
  lr.start_date,
  lr.end_date,
  lr.total_days,
  lr.paid_days,
  lr.unpaid_days,
  lr.reason,
  lr.created_at,
  GREATEST(lr.start_date, per.period_start) AS overlap_start,
  LEAST(lr.end_date, per.period_end) AS overlap_end,
  (
    LEAST(lr.end_date, per.period_end) - GREATEST(lr.start_date, per.period_start) + 1
  )::int AS overlap_calendar_days_in_period
FROM public."HRMS_leave_requests" lr
CROSS JOIN period per
JOIN public."HRMS_users" u ON u.id = lr.employee_user_id
LEFT JOIN public."HRMS_employees" e ON e.user_id = lr.employee_user_id AND e.company_id = lr.company_id
LEFT JOIN public."HRMS_leave_types" lt ON lt.id = lr.leave_type_id
WHERE lr.status = 'pending'
  AND lr.start_date <= per.period_end
  AND lr.end_date >= per.period_start
  AND (per.company_id_filter IS NULL OR lr.company_id = per.company_id_filter)
ORDER BY lr.company_id, u.name, lr.start_date;


-- =============================================================================
-- B) Daily attendance — gross hours and payroll present credit (0 or 1, never 0.5)
-- =============================================================================
WITH params AS (
  SELECT
    2026::int AS payroll_year,
    6::int AS payroll_month,
    30::int AS run_through_day,
    NULL::uuid AS company_id_filter
),
period AS (
  SELECT
    make_date(p.payroll_year, p.payroll_month, 1) AS period_start,
    make_date(
      p.payroll_year,
      p.payroll_month,
      LEAST(
        p.run_through_day,
        EXTRACT(DAY FROM (make_date(p.payroll_year, p.payroll_month, 1) + interval '1 month - 1 day'))::int
      )
    ) AS period_end,
    p.company_id_filter
  FROM params p
),
approved_leave_days AS (
  SELECT DISTINCT
    lr.company_id,
    lr.employee_user_id,
    d::date AS leave_date
  FROM public."HRMS_leave_requests" lr
  CROSS JOIN period per
  CROSS JOIN LATERAL generate_series(
    GREATEST(lr.start_date, per.period_start),
    LEAST(lr.end_date, per.period_end),
    interval '1 day'
  ) AS d
  WHERE lr.status = 'approved'
    AND lr.start_date <= per.period_end
    AND lr.end_date >= per.period_start
    AND (per.company_id_filter IS NULL OR lr.company_id = per.company_id_filter)
),
attendance_scored AS (
  SELECT
    al.company_id,
    al.id AS attendance_log_id,
    e.user_id AS employee_user_id,
    u.name AS employee_name,
    e.employee_code,
    al.work_date,
    EXTRACT(DOW FROM al.work_date)::int AS day_of_week,
    CASE EXTRACT(DOW FROM al.work_date)::int
      WHEN 0 THEN 'Sunday'
      WHEN 6 THEN 'Saturday'
      ELSE 'Weekday'
    END AS day_type,
    al.check_in_at,
    al.check_out_at,
    al.total_hours,
    CASE
      WHEN al.check_in_at IS NOT NULL AND al.check_out_at IS NOT NULL THEN
        GREATEST(0, EXTRACT(EPOCH FROM (al.check_out_at - al.check_in_at)) / 3600.0)
      WHEN al.total_hours IS NOT NULL THEN
        GREATEST(0, al.total_hours::numeric)
      ELSE NULL
    END AS gross_hours,
    (ald.leave_date IS NOT NULL) AS on_approved_leave
  FROM public."HRMS_attendance_logs" al
  CROSS JOIN period per
  JOIN public."HRMS_employees" e ON e.id = al.employee_id AND e.company_id = al.company_id
  JOIN public."HRMS_users" u ON u.id = e.user_id
  LEFT JOIN approved_leave_days ald
    ON ald.company_id = al.company_id
   AND ald.employee_user_id = e.user_id
   AND ald.leave_date = al.work_date
  WHERE al.work_date BETWEEN per.period_start AND per.period_end
    AND (per.company_id_filter IS NULL OR al.company_id = per.company_id_filter)
)
SELECT
  a.company_id,
  a.employee_user_id,
  a.employee_name,
  a.employee_code,
  a.work_date,
  a.day_type,
  a.check_in_at,
  a.check_out_at,
  ROUND(a.gross_hours::numeric, 2) AS gross_hours,
  CASE
    WHEN a.on_approved_leave THEN 0
    WHEN a.day_of_week IN (0, 6) THEN 0
    WHEN a.gross_hours IS NULL THEN 0
    WHEN a.gross_hours >= 9 THEN 1
    WHEN a.gross_hours > 4 THEN 0.5
    ELSE 0
  END AS payroll_present_credit,
  CASE
    WHEN a.on_approved_leave THEN 'On approved leave (attendance ignored)'
    WHEN a.day_of_week IN (0, 6) THEN 'Weekend (not an attendance pay day)'
    WHEN a.gross_hours IS NULL THEN 'No punch / no hours'
    WHEN a.gross_hours >= 9 THEN 'Full day (gross ≥ 9h)'
    WHEN a.gross_hours > 4 THEN 'Half day (> 4h and < 9h)'
    ELSE 'No credit (gross ≤ 4h)'
  END AS payroll_note
FROM attendance_scored a
ORDER BY a.company_id, a.employee_name, a.work_date;


-- =============================================================================
-- C) Per-employee summary (pending leaves + attendance qualifying days)
-- =============================================================================
WITH params AS (
  SELECT
    2026::int AS payroll_year,
    6::int AS payroll_month,
    30::int AS run_through_day,
    NULL::uuid AS company_id_filter
),
period AS (
  SELECT
    make_date(p.payroll_year, p.payroll_month, 1) AS period_start,
    make_date(
      p.payroll_year,
      p.payroll_month,
      LEAST(
        p.run_through_day,
        EXTRACT(DAY FROM (make_date(p.payroll_year, p.payroll_month, 1) + interval '1 month - 1 day'))::int
      )
    ) AS period_end,
    p.company_id_filter
  FROM params p
),
approved_leave_days AS (
  SELECT DISTINCT
    lr.company_id,
    lr.employee_user_id,
    d::date AS leave_date
  FROM public."HRMS_leave_requests" lr
  CROSS JOIN period per
  CROSS JOIN LATERAL generate_series(
    GREATEST(lr.start_date, per.period_start),
    LEAST(lr.end_date, per.period_end),
    interval '1 day'
  ) AS d
  WHERE lr.status = 'approved'
    AND lr.start_date <= per.period_end
    AND lr.end_date >= per.period_start
    AND (per.company_id_filter IS NULL OR lr.company_id = per.company_id_filter)
),
attendance_scored AS (
  SELECT
    al.company_id,
    e.user_id AS employee_user_id,
    u.name AS employee_name,
    al.work_date,
    EXTRACT(DOW FROM al.work_date)::int AS day_of_week,
    CASE
      WHEN al.check_in_at IS NOT NULL AND al.check_out_at IS NOT NULL THEN
        GREATEST(0, EXTRACT(EPOCH FROM (al.check_out_at - al.check_in_at)) / 3600.0)
      WHEN al.total_hours IS NOT NULL THEN
        GREATEST(0, al.total_hours::numeric)
      ELSE NULL
    END AS gross_hours,
    (ald.leave_date IS NOT NULL) AS on_approved_leave
  FROM public."HRMS_attendance_logs" al
  CROSS JOIN period per
  JOIN public."HRMS_employees" e ON e.id = al.employee_id AND e.company_id = al.company_id
  JOIN public."HRMS_users" u ON u.id = e.user_id
  LEFT JOIN approved_leave_days ald
    ON ald.company_id = al.company_id
   AND ald.employee_user_id = e.user_id
   AND ald.leave_date = al.work_date
  WHERE al.work_date BETWEEN per.period_start AND per.period_end
    AND (per.company_id_filter IS NULL OR al.company_id = per.company_id_filter)
),
attendance_summary AS (
  SELECT
    company_id,
    employee_user_id,
    employee_name,
    COUNT(*) FILTER (
      WHERE NOT on_approved_leave
        AND day_of_week NOT IN (0, 6)
        AND gross_hours IS NOT NULL
        AND gross_hours >= 9
    ) AS attendance_full_days_gte_9h,
    COUNT(*) FILTER (
      WHERE NOT on_approved_leave
        AND day_of_week NOT IN (0, 6)
        AND gross_hours IS NOT NULL
        AND gross_hours > 4
        AND gross_hours < 9
    ) AS attendance_half_days_4_to_9h,
    COALESCE(SUM(
      CASE
        WHEN on_approved_leave OR day_of_week IN (0, 6) OR gross_hours IS NULL THEN 0
        WHEN gross_hours >= 9 THEN 1
        WHEN gross_hours > 4 THEN 0.5
        ELSE 0
      END
    ), 0) AS attendance_pay_credits,
    COUNT(*) FILTER (
      WHERE NOT on_approved_leave
        AND day_of_week NOT IN (0, 6)
        AND gross_hours IS NOT NULL
        AND gross_hours <= 4
    ) AS weekday_days_lte_4h_zero_credit,
    COUNT(*) FILTER (
      WHERE NOT on_approved_leave
        AND day_of_week NOT IN (0, 6)
        AND gross_hours IS NULL
    ) AS weekday_days_no_hours
  FROM attendance_scored
  GROUP BY company_id, employee_user_id, employee_name
),
pending_summary AS (
  SELECT
    lr.company_id,
    lr.employee_user_id,
    COUNT(*) AS pending_leave_requests,
    COALESCE(SUM(lr.total_days), 0) AS pending_leave_total_days_booked
  FROM public."HRMS_leave_requests" lr
  CROSS JOIN period per
  WHERE lr.status = 'pending'
    AND lr.start_date <= per.period_end
    AND lr.end_date >= per.period_start
    AND (per.company_id_filter IS NULL OR lr.company_id = per.company_id_filter)
  GROUP BY lr.company_id, lr.employee_user_id
)
SELECT
  COALESCE(a.company_id, p.company_id) AS company_id,
  COALESCE(a.employee_user_id, p.employee_user_id) AS employee_user_id,
  a.employee_name,
  COALESCE(p.pending_leave_requests, 0) AS pending_leave_requests,
  COALESCE(p.pending_leave_total_days_booked, 0) AS pending_leave_total_days_booked,
  COALESCE(a.attendance_pay_credits, 0) AS attendance_pay_credits,
  COALESCE(a.attendance_full_days_gte_9h, 0) AS attendance_full_days_gte_9h,
  COALESCE(a.attendance_half_days_4_to_9h, 0) AS attendance_half_days_4_to_9h,
  COALESCE(a.weekday_days_lte_4h_zero_credit, 0) AS weekday_days_lte_4h_zero_credit
FROM attendance_summary a
FULL OUTER JOIN pending_summary p
  ON p.company_id = a.company_id AND p.employee_user_id = a.employee_user_id
ORDER BY company_id, employee_name;
