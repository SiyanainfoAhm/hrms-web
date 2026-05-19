-- Re-open today's attendance if it was auto-closed by mistake (shift still in progress / user still working).
-- Run once after 20260519120000 if same-day rows were closed too early.

UPDATE "HRMS_attendance_logs"
SET
  check_out_at = NULL,
  total_hours = NULL,
  updated_at = now(),
  notes = trim(
    both ' ' from
      regexp_replace(
        regexp_replace(
          COALESCE(notes, ''),
          'Punched out automatically at shift end \(user did not punch out\)\.',
          '',
          'gi'
        ),
        'Didn''t punch out by user\.',
        '',
        'gi'
      )
  )
WHERE work_date = (timezone('Asia/Kolkata', now()))::date
  AND check_in_at IS NOT NULL
  AND check_out_at IS NOT NULL
  AND notes ILIKE '%Didn''t punch out by user.%';
