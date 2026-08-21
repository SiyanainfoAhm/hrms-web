/**
 * Aggregate desktop-agent activity for an attendance log.
 *
 * Active  = SUM(HRMS_activity_sessions.active_seconds)  (capped at Gross)
 * Idle    = max(0, Gross − Active − Lunch/Tea break)
 * Gross   = from HRMS_attendance_logs punch times
 */

export type ActivitySessionRow = {
  attendance_log_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  last_heartbeat_at?: string | null;
  active_seconds?: number | null;
  idle_seconds?: number | null;
  disconnected_seconds?: number | null;
};

export type ActivityAggregateResult = {
  activeSeconds: number;
  idleSeconds: number;
  disconnectedSecondsStored: number;
  sessionCount: number;
};

/** Raw SUM across every session row for the attendance_log_id. */
export function aggregateActivitySeconds(
  sessions: ActivitySessionRow[],
): ActivityAggregateResult {
  let activeSeconds = 0;
  let idleSeconds = 0;
  let disconnectedSecondsStored = 0;

  for (const s of sessions) {
    activeSeconds += Math.max(0, Number(s.active_seconds) || 0);
    idleSeconds += Math.max(0, Number(s.idle_seconds) || 0);
    disconnectedSecondsStored += Math.max(0, Number(s.disconnected_seconds) || 0);
  }

  return {
    activeSeconds,
    idleSeconds,
    disconnectedSecondsStored,
    sessionCount: sessions.length,
  };
}

/** Active must never exceed Gross (guards against duplicate session rows). */
export function clampActivityMinutesToGross(
  minutes: number,
  grossMinutes: number | null | undefined,
): number {
  const n = Math.max(0, Math.floor(Number(minutes) || 0));
  if (grossMinutes == null || !Number.isFinite(grossMinutes)) return n;
  return Math.min(n, Math.max(0, Math.floor(grossMinutes)));
}

/**
 * Total Idle on Company Attendance:
 *   Idle = max(0, Gross − Active − Lunch/Tea)
 */
export function idleMinutesFromGrossActiveBreak(args: {
  grossMinutes: number | null | undefined;
  activeMinutes: number;
  breakMinutes: number;
}): number | null {
  if (args.grossMinutes == null || !Number.isFinite(args.grossMinutes)) return null;
  const gross = Math.max(0, Math.floor(args.grossMinutes));
  const active = Math.max(0, Math.floor(args.activeMinutes));
  const brk = Math.max(0, Math.floor(args.breakMinutes));
  return Math.max(0, gross - active - brk);
}

export function groupSessionsByLogId(
  sessions: ActivitySessionRow[],
): Map<string, ActivitySessionRow[]> {
  const map = new Map<string, ActivitySessionRow[]>();
  for (const s of sessions) {
    const logId = String(s.attendance_log_id ?? "");
    if (!logId) continue;
    const prev = map.get(logId) ?? [];
    prev.push(s);
    map.set(logId, prev);
  }
  return map;
}
