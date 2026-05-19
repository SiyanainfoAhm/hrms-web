-- Backfill: set check_out_at to shift end for rows with punch-in but no final punch-out.
-- Skips TODAY (IST calendar day) so in-progress attendance stays open until manual punch-out or next-day punch-in.
-- Day shift: work_date + end_time (default 18:00) in Asia/Kolkata.
-- Night shift: work_date + 1 day + end_time (default 02:00) in America/New_York.

WITH open_logs AS (
  SELECT
    al.id,
    al.work_date,
    al.check_in_at,
    al.lunch_break_minutes,
    al.tea_break_minutes,
    al.lunch_break_started_at,
    al.tea_break_started_at,
    al.tea_check_in_at,
    al.notes,
    CASE
      WHEN COALESCE(s.is_night_shift, false) THEN
        timezone(
          'UTC',
          (al.work_date::date + interval '1 day' + COALESCE(s.end_time::time, time '02:00'))
            AT TIME ZONE 'America/New_York'
        )
      ELSE
        timezone(
          'UTC',
          (al.work_date::date + COALESCE(s.end_time::time, time '18:00'))
            AT TIME ZONE 'Asia/Kolkata'
        )
    END AS checkout_utc
  FROM "HRMS_attendance_logs" al
  INNER JOIN "HRMS_employees" e ON e.id = al.employee_id AND e.company_id = al.company_id
  LEFT JOIN "HRMS_shifts" s ON s.id = e.shift_id AND s.company_id = al.company_id
  WHERE al.check_in_at IS NOT NULL
    AND al.check_out_at IS NULL
    AND al.work_date < (timezone('Asia/Kolkata', now()))::date
),
finalized AS (
  SELECT
    o.*,
    GREATEST(
      0,
      EXTRACT(EPOCH FROM (o.checkout_utc - o.check_in_at)) / 60.0
    )::int AS gross_min,
    CASE
      WHEN o.lunch_break_started_at IS NOT NULL THEN
        LEAST(
          1440,
          COALESCE(o.lunch_break_minutes, 0)
            + GREATEST(0, EXTRACT(EPOCH FROM (o.checkout_utc - o.lunch_break_started_at)) / 60.0)::int
        )
      ELSE COALESCE(o.lunch_break_minutes, 0)
    END AS final_lunch_min,
    CASE
      WHEN o.tea_break_started_at IS NOT NULL THEN
        LEAST(
          1440,
          COALESCE(o.tea_break_minutes, 0)
            + GREATEST(0, EXTRACT(EPOCH FROM (o.checkout_utc - o.tea_break_started_at)) / 60.0)::int
        )
      ELSE COALESCE(o.tea_break_minutes, 0)
    END AS final_tea_min
  FROM open_logs o
  WHERE o.checkout_utc > o.check_in_at
    AND o.checkout_utc <= timezone('UTC', now())
)
UPDATE "HRMS_attendance_logs" al
SET
  check_out_at = f.checkout_utc,
  lunch_break_minutes = f.final_lunch_min,
  tea_break_minutes = f.final_tea_min,
  lunch_break_started_at = NULL,
  tea_break_started_at = NULL,
  tea_check_in_at = CASE WHEN al.tea_break_started_at IS NOT NULL THEN f.checkout_utc ELSE al.tea_check_in_at END,
  total_hours = ROUND((f.gross_min / 60.0)::numeric, 2),
  status = 'present',
  notes = trim(
    COALESCE(al.notes, '')
      || ' Punched out automatically at shift end (user did not punch out). Didn''t punch out by user.'
  ),
  updated_at = f.checkout_utc
FROM finalized f
WHERE al.id = f.id;
