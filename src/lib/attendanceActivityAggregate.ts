/**
 * Aggregate desktop-agent activity for an attendance log.
 *
 * The agent sometimes opens parallel near-duplicate sessions (multi-process /
 * restart). Blind SUM(active_seconds) overcounts — collapse overlaps first.
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

const OVERLAP_START_SLACK_MS = 5_000;

function sessionEndMs(s: ActivitySessionRow): number | null {
  const raw = s.ended_at ?? s.last_heartbeat_at;
  if (!raw) return null;
  const ms = new Date(String(raw)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function sessionStartMs(s: ActivitySessionRow): number | null {
  if (!s.started_at) return null;
  const ms = new Date(String(s.started_at)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Keep the strongest session in each overlapping cluster, then sum.
 */
export function aggregateActivitySeconds(sessions: ActivitySessionRow[]): {
  activeSeconds: number;
  idleSeconds: number;
  disconnectedSecondsStored: number;
  sessionCount: number;
  dedupedSessionCount: number;
} {
  const normalized = sessions
    .map((s) => {
      const start = sessionStartMs(s);
      const end = sessionEndMs(s);
      return {
        start,
        end: end ?? start,
        active: Math.max(0, Number(s.active_seconds) || 0),
        idle: Math.max(0, Number(s.idle_seconds) || 0),
        disconnected: Math.max(0, Number(s.disconnected_seconds) || 0),
      };
    })
    .filter((s) => s.start != null)
    .sort((a, b) => Number(a.start) - Number(b.start));

  const kept: typeof normalized = [];

  for (const s of normalized) {
    const prev = kept[kept.length - 1];
    if (
      prev &&
      s.start != null &&
      prev.start != null &&
      s.start <= Number(prev.end) + OVERLAP_START_SLACK_MS
    ) {
      prev.end = Math.max(Number(prev.end), Number(s.end ?? s.start));
      prev.active = Math.max(prev.active, s.active);
      prev.idle = Math.max(prev.idle, s.idle);
      prev.disconnected = Math.max(prev.disconnected, s.disconnected);
      continue;
    }
    kept.push({ ...s });
  }

  return {
    activeSeconds: kept.reduce((sum, s) => sum + s.active, 0),
    idleSeconds: kept.reduce((sum, s) => sum + s.idle, 0),
    disconnectedSecondsStored: kept.reduce((sum, s) => sum + s.disconnected, 0),
    sessionCount: normalized.length,
    dedupedSessionCount: kept.length,
  };
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
