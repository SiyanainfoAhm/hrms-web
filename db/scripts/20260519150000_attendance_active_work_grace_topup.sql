-- TOP-UP: ensure full 18 minutes active-work credit for everyone on work_date (IST).
--
-- Why the first script may show total_idle_seconds < 1080:
--   Dashboard "Active work" = gross − (lunch/tea + agent IDLE + DISCONNECTED).
--   Most of the 18m gap is often DISCONNECTED (agent gaps), not idle_seconds in DB.
--   This script:
--     1) Moves any remaining idle_seconds → active_seconds on existing sessions
--     2) Inserts/extends a manual_grace session for whatever seconds are still missing (up to 18 min)
--
-- Safe to re-run: only tops up to 18 min total from manual_grace sessions per log.

BEGIN;

DO $$
DECLARE
  cfg             record;
  r               record;
  v_target_sec    int;
  v_existing_sec  int;
  v_remaining     int;
  v_last_end      timestamptz;
  v_bridge_start  timestamptz;
  v_bridge_end    timestamptz;
  v_moved_idle    int;
  v_applied       int := 0;
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
    ORDER BY e.employee_code NULLS LAST
  LOOP
    -- 1) Shift idle → active on all sessions (reduces agent idle in dashboard math).
    UPDATE public."HRMS_activity_sessions" s
    SET
      active_seconds = COALESCE(s.active_seconds, 0) + COALESCE(s.idle_seconds, 0),
      idle_seconds = 0
    WHERE s.attendance_log_id = r.log_id
      AND COALESCE(s.idle_seconds, 0) > 0;

    GET DIAGNOSTICS v_moved_idle = ROW_COUNT;

    -- 2) How much manual_grace time already inserted for this log?
    SELECT COALESCE(SUM(GREATEST(0, s.active_seconds)), 0)::int
      INTO v_existing_sec
    FROM public."HRMS_activity_sessions" s
    WHERE s.attendance_log_id = r.log_id
      AND s.source = 'manual_grace';

    v_remaining := GREATEST(0, v_target_sec - v_existing_sec);
    IF v_remaining = 0 THEN
      RAISE NOTICE 'Skip % — already has % sec manual_grace.', r.employee_code, v_existing_sec;
      CONTINUE;
    END IF;

    -- 3) Place compensatory session in tail gap (after last session / heartbeat).
    SELECT MAX(COALESCE(s.ended_at, s.last_heartbeat_at, s.started_at))
      INTO v_last_end
    FROM public."HRMS_activity_sessions" s
    WHERE s.attendance_log_id = r.log_id
      AND s.source IS DISTINCT FROM 'manual_grace';

    v_bridge_start := GREATEST(
      r.check_in_at + interval '5 minutes',
      COALESCE(v_last_end, r.check_in_at) + interval '1 minute'
    );
    v_bridge_end := v_bridge_start + (v_remaining || ' seconds')::interval;

    IF r.check_out_at IS NOT NULL AND v_bridge_end > r.check_out_at THEN
      v_bridge_end := r.check_out_at;
      v_bridge_start := v_bridge_end - (v_remaining || ' seconds')::interval;
    END IF;

    IF v_bridge_start < r.check_in_at THEN
      v_bridge_start := r.check_in_at;
      v_bridge_end := v_bridge_start + (v_remaining || ' seconds')::interval;
    END IF;

    IF v_bridge_end <= v_bridge_start THEN
      RAISE WARNING 'Log % (%) — cannot place % sec grace (no room in shift window).',
        r.employee_code, r.log_id, v_remaining;
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
      v_bridge_start,
      v_bridge_end,
      GREATEST(0, EXTRACT(EPOCH FROM (v_bridge_end - v_bridge_start))::int),
      0,
      0,
      'manual_grace',
      now(),
      v_bridge_end
    );

    UPDATE public."HRMS_attendance_logs"
    SET
      notes = trim(
        COALESCE(notes, '')
          || CASE
               WHEN COALESCE(notes, '') ILIKE '%Active work grace (top-up)%' THEN ''
               ELSE ' Active work grace (top-up): full 18 min credited.'
             END
      ),
      updated_at = now()
    WHERE id = r.log_id;

    v_applied := v_applied + 1;
    RAISE NOTICE 'Top-up % (%): +% sec manual_grace (moved idle on % sessions).',
      r.employee_code, r.log_id, EXTRACT(EPOCH FROM (v_bridge_end - v_bridge_start))::int, v_moved_idle;
  END LOOP;

  RAISE NOTICE 'Top-up complete: % logs updated for %.', v_applied, cfg.work_date;
END $$;

-- Verify: idle should be 0 or low; each row should have grace_sessions >= 1 and ~1080 sec grace
SELECT
  e.employee_code,
  al.id AS log_id,
  COALESCE(SUM(s.idle_seconds), 0) AS total_idle_seconds,
  COALESCE(SUM(s.active_seconds) FILTER (WHERE s.source = 'manual_grace'), 0) AS manual_grace_active_seconds
FROM public."HRMS_attendance_logs" al
JOIN public."HRMS_employees" e ON e.id = al.employee_id
LEFT JOIN public."HRMS_activity_sessions" s ON s.attendance_log_id = al.id
WHERE al.work_date = (timezone('Asia/Kolkata', now()))::date
  AND al.check_in_at IS NOT NULL
GROUP BY e.employee_code, al.id
ORDER BY e.employee_code;

COMMIT;
