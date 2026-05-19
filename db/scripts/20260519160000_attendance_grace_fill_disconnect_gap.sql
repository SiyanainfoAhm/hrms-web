-- Fill the LARGEST agent disconnect gap with a manual_grace session (for system-down / no heartbeat).
-- Screenshots are NOT used in active-work math — only HRMS_activity_sessions timestamps matter.
--
-- Active work = gross − (breaks + agent idle + disconnected).
-- System down → no sessions in that window → disconnected minutes (not missing screenshots).
--
-- Replaces any prior manual_grace rows for today's logs, then inserts grace inside the biggest gap.
-- Run in Supabase SQL editor (full file).

BEGIN;

DO $$
DECLARE
  cfg               record;
  r                 record;
  sess_row          record;
  v_target_sec      int;
  v_cursor          timestamptz;
  v_cursor_end      timestamptz;
  v_gap_start       timestamptz;
  v_gap_sec         int;
  v_max_gap_sec     int;
  v_best_start      timestamptz;
  v_best_end        timestamptz;
  v_grace_sec       int := 60;
  v_post_punch_sec  int := 300;
  v_insert_start    timestamptz;
  v_insert_end      timestamptz;
  v_insert_sec      int;
  v_end_bound       timestamptz;
  v_applied         int := 0;
BEGIN
  SELECT
    18 AS grace_minutes,
    (timezone('Asia/Kolkata', now()))::date AS work_date
  INTO cfg;

  v_target_sec := cfg.grace_minutes * 60;

  FOR r IN
    SELECT
      al.id AS log_id,
      al.employee_id,
      al.company_id,
      al.check_in_at,
      al.check_out_at,
      e.employee_code
    FROM public."HRMS_attendance_logs" al
    INNER JOIN public."HRMS_employees" e
      ON e.id = al.employee_id AND e.company_id = al.company_id
    WHERE al.work_date = cfg.work_date
      AND al.check_in_at IS NOT NULL
  LOOP
    v_end_bound := COALESCE(r.check_out_at, timezone('UTC', now()));

    -- Remove misplaced manual_grace sessions so we can re-bridge the real outage gap.
    DELETE FROM public."HRMS_activity_sessions"
    WHERE attendance_log_id = r.log_id
      AND source = 'manual_grace';

    -- Zero idle (counts against active work).
    UPDATE public."HRMS_activity_sessions" sess
    SET
      active_seconds = COALESCE(sess.active_seconds, 0) + COALESCE(sess.idle_seconds, 0),
      idle_seconds = 0
    WHERE sess.attendance_log_id = r.log_id
      AND COALESCE(sess.idle_seconds, 0) > 0;

    v_cursor := r.check_in_at;
    v_max_gap_sec := 0;
    v_best_start := NULL;
    v_best_end := NULL;

    FOR sess_row IN
      SELECT
        sess.started_at,
        COALESCE(sess.ended_at, sess.last_heartbeat_at, sess.started_at) AS session_end
      FROM public."HRMS_activity_sessions" sess
      WHERE sess.attendance_log_id = r.log_id
        AND sess.started_at IS NOT NULL
        AND sess.source IS DISTINCT FROM 'manual_grace'
      ORDER BY sess.started_at ASC
    LOOP
      IF v_cursor = r.check_in_at THEN
        v_gap_start := v_cursor + (v_post_punch_sec || ' seconds')::interval;
      ELSE
        v_gap_start := v_cursor + (v_grace_sec || ' seconds')::interval;
      END IF;

      IF sess_row.started_at > v_gap_start THEN
        v_gap_sec := GREATEST(0, EXTRACT(EPOCH FROM (sess_row.started_at - v_gap_start))::int);
        IF v_gap_sec > v_max_gap_sec THEN
          v_max_gap_sec := v_gap_sec;
          v_best_start := v_gap_start;
          v_best_end := sess_row.started_at;
        END IF;
      END IF;

      v_cursor_end := sess_row.session_end;
      IF v_cursor_end > v_cursor THEN
        v_cursor := v_cursor_end;
      END IF;
    END LOOP;

    -- Tail gap (after last session until punch-out / now).
    IF v_cursor = r.check_in_at THEN
      v_gap_start := v_cursor + (v_post_punch_sec || ' seconds')::interval;
    ELSE
      v_gap_start := v_cursor + (v_grace_sec || ' seconds')::interval;
    END IF;

    IF v_end_bound > v_gap_start THEN
      v_gap_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_end_bound - v_gap_start))::int);
      IF v_gap_sec > v_max_gap_sec THEN
        v_max_gap_sec := v_gap_sec;
        v_best_start := v_gap_start;
        v_best_end := v_end_bound;
      END IF;
    END IF;

    IF v_max_gap_sec <= 0 OR v_best_start IS NULL THEN
      RAISE WARNING '% (%) — no disconnect gap found to fill.', r.employee_code, r.log_id;
      CONTINUE;
    END IF;

    v_insert_sec := LEAST(v_target_sec, v_max_gap_sec);
    v_insert_start := v_best_start;
    v_insert_end := v_insert_start + (v_insert_sec || ' seconds')::interval;

    IF v_insert_end > v_best_end THEN
      v_insert_end := v_best_end;
      v_insert_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_insert_end - v_insert_start))::int);
    END IF;

    IF v_insert_sec <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public."HRMS_activity_sessions" (
      company_id,
      employee_id,
      attendance_log_id,
      started_at,
      ended_at,
      active_seconds,
      idle_seconds,
      disconnected_seconds,
      source,
      created_at,
      last_heartbeat_at
    ) VALUES (
      r.company_id,
      r.employee_id,
      r.log_id,
      v_insert_start,
      v_insert_end,
      v_insert_sec,
      0,
      0,
      'manual_grace',
      now(),
      v_insert_end
    );

    UPDATE public."HRMS_attendance_logs"
    SET
      notes = trim(
        COALESCE(notes, '')
          || ' Active work grace: system downtime / disconnect gap filled ('
          || v_insert_sec || ' sec).'
      ),
      updated_at = now()
    WHERE id = r.log_id;

    v_applied := v_applied + 1;
    RAISE NOTICE '% — filled % sec in gap % → % (gap was % sec).',
      r.employee_code, v_insert_sec, v_insert_start, v_insert_end, v_max_gap_sec;
  END LOOP;

  RAISE NOTICE 'Disconnect-gap grace: % logs updated on %.', v_applied, cfg.work_date;
END $$;

-- Diagnostic: largest gaps per employee (run after COMMIT)
WITH sess AS (
  SELECT
    s.attendance_log_id,
    s.started_at,
    COALESCE(s.ended_at, s.last_heartbeat_at, s.started_at) AS session_end,
    s.source
  FROM public."HRMS_activity_sessions" s
  JOIN public."HRMS_attendance_logs" al ON al.id = s.attendance_log_id
  WHERE al.work_date = (timezone('Asia/Kolkata', now()))::date
)
SELECT
  e.employee_code,
  al.id AS log_id,
  COUNT(*) FILTER (WHERE sess.source = 'manual_grace') AS grace_sessions,
  COALESCE(
    SUM(EXTRACT(EPOCH FROM (sess.session_end - sess.started_at)))
      FILTER (WHERE sess.source = 'manual_grace'),
    0
  )::int AS grace_seconds
FROM public."HRMS_attendance_logs" al
JOIN public."HRMS_employees" e ON e.id = al.employee_id
LEFT JOIN sess ON sess.attendance_log_id = al.id
WHERE al.work_date = (timezone('Asia/Kolkata', now()))::date
  AND al.check_in_at IS NOT NULL
GROUP BY e.employee_code, al.id
ORDER BY e.employee_code;

COMMIT;
