/**
 * Derives "disconnected" seconds (gaps not covered by HRMS_activity_sessions)
 * for attendance active/idle math.
 *
 * After a new-day punch-in, the desktop agent may take a short time to open a
 * session. A 60s grace there still produced visible "idle" in the first minutes.
 * The first gap after check-in (only) uses a longer grace so routine startup
 * does not look like idle; gaps after a session exists keep the tight 60s grace.
 */

export const HEARTBEAT_GRACE_SECONDS = 60;
/** Grace from check-in until first session must appear before disconnect accrues. */
export const POST_PUNCH_DISCONNECT_GRACE_SECONDS = 5 * 60;

type BreakWindow = { startMs: number; endMs: number };

function overlapMs(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function breakOverlapMs(
  startMs: number,
  endMs: number,
  breakWindows: BreakWindow[],
): number {
  return breakWindows.reduce(
    (sum, w) => sum + overlapMs(startMs, endMs, w.startMs, w.endMs),
    0,
  );
}

export function disconnectedSecondsFromSessions(
  rawSessions: any[],
  checkInAt: string | null,
  checkOutAt: string | null,
  nowMs: number,
  breakWindows: BreakWindow[] = [],
): number {
  if (!checkInAt) return 0;

  const heartbeatGraceMs = HEARTBEAT_GRACE_SECONDS * 1000;
  const postPunchGraceMs = POST_PUNCH_DISCONNECT_GRACE_SECONDS * 1000;
  const startMs = new Date(checkInAt).getTime();
  const endMs = checkOutAt ? new Date(checkOutAt).getTime() : nowMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  const sessions = rawSessions
    .map((s) => {
      const startedAt = s.started_at
        ? new Date(String(s.started_at)).getTime()
        : null;

      const endedAtRaw = s.ended_at ?? s.last_heartbeat_at;
      const endedAt = endedAtRaw
        ? new Date(String(endedAtRaw)).getTime()
        : null;

      return {
        start: startedAt,
        end: endedAt,
      };
    })
    .filter((s) => s.start != null && s.end != null)
    .sort((a, b) => Number(a.start) - Number(b.start));

  let disconnectedSeconds = 0;
  let cursorMs = startMs;

  for (const s of sessions) {
    const sessionStartMs = Number(s.start);
    const sessionEndMs = Number(s.end);
    const gapGraceMs = cursorMs === startMs ? postPunchGraceMs : heartbeatGraceMs;

    if (sessionStartMs > cursorMs + gapGraceMs) {
      const gapStartMs = cursorMs + gapGraceMs;
      const gapEndMs = sessionStartMs;
      const gapMs = Math.max(0, gapEndMs - gapStartMs);
      const breakMs = breakOverlapMs(gapStartMs, gapEndMs, breakWindows);

      disconnectedSeconds += Math.floor(Math.max(0, gapMs - breakMs) / 1000);
    }

    cursorMs = Math.max(cursorMs, sessionEndMs);
  }

  const tailGraceMs =
    sessions.length === 0 ? postPunchGraceMs : heartbeatGraceMs;

  if (endMs > cursorMs + tailGraceMs) {
    const gapStartMs = cursorMs + tailGraceMs;
    const gapEndMs = endMs;
    const gapMs = Math.max(0, gapEndMs - gapStartMs);
    const breakMs = breakOverlapMs(gapStartMs, gapEndMs, breakWindows);

    disconnectedSeconds += Math.floor(Math.max(0, gapMs - breakMs) / 1000);
  }

  return Math.max(0, disconnectedSeconds);
}
