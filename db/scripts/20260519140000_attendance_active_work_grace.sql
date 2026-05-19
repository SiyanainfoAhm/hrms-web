-- One-off: credit active-work grace for ALL employees with attendance on work_date (IST).
-- Active work = gross − (breaks + agent idle + disconnected).
--
-- Run in Supabase SQL editor (postgres / service_role). Edit grace_minutes / work_date if needed,
-- then run the whole file (BEGIN … COMMIT). Skips logs that already have "Active work grace:" in notes.

BEGIN;

DROP TABLE IF EXISTS _attendance_grace_cfg;
CREATE TEMP TABLE _attendance_grace_cfg (
  grace_minutes int  NOT NULL DEFAULT 18,
  work_date       date NOT NULL DEFAULT (timezone('Asia/Kolkata', now()))::date,
  reason          text NOT NULL DEFAULT 'Active work grace: time on infrastructure fixes (manual adjustment).'
);

INSERT INTO _attendance_grace_cfg DEFAULT VALUES;

DO $$
DECLARE
  cfg               record;
  r                 record;
  v_grace_seconds   int;
  v_remaining       int;
  v_session_id      uuid;
  v_session_idle    int;
  v_deduct          int;
  v_total_idle      int;
  v_bridge_start    timestamptz;
  v_bridge_end      timestamptz;
  v_first_session   timestamptz;
  v_applied         int := 0;
  v_skipped         int := 0;
BEGIN
  SELECT * INTO cfg FROM _attendance_grace_cfg LIMIT 1;

  v_grace_seconds := GREATEST(0, cfg.grace_minutes) * 60;
  IF v_grace_seconds = 0 THEN
    RAISE EXCEPTION 'grace_minutes must be > 0.';
  END IF;

  FOR r IN
    SELECT
      al.id            AS log_id,
      al.employee_id,
      al.company_id,
      al.check_in_at,
      al.check_out_at,
      al.notes,
      (al.activity_purged_at IS NOT NULL) AS is_purged,
      e.employee_code
    FROM public."HRMS_attendance_logs" al
    INNER JOIN public."HRMS_employees" e
      ON e.id = al.employee_id AND e.company_id = al.company_id
    WHERE al.work_date = cfg.work_date
      AND al.check_in_at IS NOT NULL
    ORDER BY e.employee_code NULLS LAST, al.check_in_at
  LOOP
    IF COALESCE(r.notes, '') ILIKE '%Active work grace:%' THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE 'Skip % (%) — grace already applied.', r.employee_code, r.log_id;
      CONTINUE;
    END IF;

    v_remaining := v_grace_seconds;

    IF r.is_purged THEN
      UPDATE public."HRMS_attendance_logs" l
      SET
        agent_idle_minutes = GREATEST(
          0,
          COALESCE(l.agent_idle_minutes, 0)
            - LEAST(COALESCE(l.agent_idle_minutes, 0), cfg.grace_minutes)
        ),
        agent_disconnected_minutes = GREATEST(
          0,
          COALESCE(l.agent_disconnected_minutes, 0)
            - GREATEST(
                0,
                cfg.grace_minutes
                  - LEAST(COALESCE(l.agent_idle_minutes, 0), cfg.grace_minutes)
              )
        ),
        notes = trim(COALESCE(l.notes, '') || ' ' || cfg.reason),
        updated_at = now()
      WHERE l.id = r.log_id;

      v_applied := v_applied + 1;
      RAISE NOTICE 'Purged log % (%) — % min grace.', r.employee_code, r.log_id, cfg.grace_minutes;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(GREATEST(0, idle_seconds)), 0)::int
      INTO v_total_idle
    FROM public."HRMS_activity_sessions"
    WHERE attendance_log_id = r.log_id;

    WHILE v_remaining > 0 LOOP
      SELECT s.id, GREATEST(0, COALESCE(s.idle_seconds, 0))::int
        INTO v_session_id, v_session_idle
      FROM public."HRMS_activity_sessions" s
      WHERE s.attendance_log_id = r.log_id
        AND COALESCE(s.idle_seconds, 0) > 0
      ORDER BY s.idle_seconds DESC, s.started_at ASC
      LIMIT 1;

      EXIT WHEN v_session_id IS NULL;

      v_deduct := LEAST(v_session_idle, v_remaining);

      UPDATE public."HRMS_activity_sessions"
      SET idle_seconds = GREATEST(0, COALESCE(idle_seconds, 0) - v_deduct)
      WHERE id = v_session_id;

      v_remaining := v_remaining - v_deduct;
    END LOOP;

    IF v_remaining > 0 AND r.check_in_at IS NOT NULL THEN
      SELECT MIN(s.started_at)
        INTO v_first_session
      FROM public."HRMS_activity_sessions" s
      WHERE s.attendance_log_id = r.log_id
        AND s.started_at IS NOT NULL;

      v_bridge_start := r.check_in_at + interval '5 minutes';
      IF v_first_session IS NOT NULL
         AND v_first_session > v_bridge_start + (v_remaining || ' seconds')::interval THEN
        v_bridge_end := v_bridge_start + (v_remaining || ' seconds')::interval;
      ELSE
        v_bridge_start := GREATEST(
          r.check_in_at,
          COALESCE(v_first_session, r.check_in_at) - (v_remaining || ' seconds')::interval
        );
        v_bridge_end := v_bridge_start + (v_remaining || ' seconds')::interval;
      END IF;

      IF r.check_out_at IS NOT NULL AND v_bridge_end > r.check_out_at THEN
        v_bridge_end := r.check_out_at;
        v_bridge_start := v_bridge_end - (v_remaining || ' seconds')::interval;
      END IF;

      IF v_bridge_end > v_bridge_start THEN
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
          v_bridge_start,
          v_bridge_end,
          GREATEST(0, EXTRACT(EPOCH FROM (v_bridge_end - v_bridge_start))::int),
          0,
          0,
          'manual_grace',
          now(),
          v_bridge_end
        );
        v_remaining := 0;
      END IF;
    END IF;

    IF v_remaining > 0 THEN
      RAISE WARNING 'Log % (%) — % sec grace unallocated (idle was % sec).',
        r.employee_code, r.log_id, v_remaining, v_total_idle;
    END IF;

    UPDATE public."HRMS_attendance_logs"
    SET
      notes = trim(COALESCE(notes, '') || ' ' || cfg.reason),
      updated_at = now()
    WHERE id = r.log_id;

    v_applied := v_applied + 1;
    RAISE NOTICE 'Applied % min grace to % (%).', cfg.grace_minutes, r.employee_code, r.log_id;
  END LOOP;

  IF v_applied = 0 AND v_skipped = 0 THEN
    RAISE EXCEPTION 'No attendance logs with check-in on %.', cfg.work_date;
  END IF;

  RAISE NOTICE 'Done: % applied, % skipped (already had grace), work_date %.',
    v_applied, v_skipped, cfg.work_date;
END $$;

-- Summary after apply
SELECT
  e.employee_code,
  u.email,
  al.id AS log_id,
  al.check_in_at,
  al.notes,
  COALESCE(SUM(GREATEST(0, s.idle_seconds)), 0) AS total_idle_seconds,
  COUNT(s.id) FILTER (WHERE s.source = 'manual_grace') AS grace_sessions
FROM public."HRMS_attendance_logs" al
INNER JOIN public."HRMS_employees" e ON e.id = al.employee_id
LEFT JOIN public."HRMS_users" u ON u.id = e.user_id
LEFT JOIN public."HRMS_activity_sessions" s ON s.attendance_log_id = al.id
WHERE al.work_date = (timezone('Asia/Kolkata', now()))::date
  AND al.check_in_at IS NOT NULL
  AND al.notes ILIKE '%Active work grace:%'
GROUP BY e.employee_code, u.email, al.id, al.check_in_at, al.notes
ORDER BY e.employee_code;

COMMIT;
