import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveCombinedBreakBreakdown } from "@/lib/attendancePolicy";
import { canUserMarkAttendance } from "@/lib/attendanceEmployee";
import {
  computeWorkDateForNow,
  getAttendanceContextForUser,
} from "@/lib/attendanceTimeZone";

const HEARTBEAT_GRACE_SECONDS = 60;

/** YYYY-MM-DD */
function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function minutesBetween(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}

type BreakWindow = {
  startMs: number;
  endMs: number;
};

function asSegments(raw: unknown): { out: string; in: string }[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((x) => (x && typeof x === "object" ? x : null))
      .filter(Boolean)
      .map((x: any) => ({
        out: String(x.out ?? ""),
        in: String(x.in ?? ""),
      }))
      .filter((s) => s.out && s.in);
  }

  if (typeof raw === "string") {
    try {
      return asSegments(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  return [];
}

function addBreakWindow(
  windows: BreakWindow[],
  startIso: string | null | undefined,
  endIso: string | null | undefined,
) {
  if (!startIso || !endIso) return;

  const startMs = new Date(String(startIso)).getTime();
  const endMs = new Date(String(endIso)).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return;
  }

  windows.push({ startMs, endMs });
}

function mergeBreakWindows(windows: BreakWindow[]): BreakWindow[] {
  const sorted = windows
    .filter(
      (w) =>
        Number.isFinite(w.startMs) &&
        Number.isFinite(w.endMs) &&
        w.endMs > w.startMs,
    )
    .sort((a, b) => a.startMs - b.startMs);

  const merged: BreakWindow[] = [];

  for (const w of sorted) {
    const last = merged[merged.length - 1];

    if (!last || w.startMs > last.endMs) {
      merged.push({ ...w });
    } else {
      last.endMs = Math.max(last.endMs, w.endMs);
    }
  }

  return merged;
}

function breakWindowsFromLog(log: any, nowMs: number): BreakWindow[] {
  const windows: BreakWindow[] = [];
  const nowIso = new Date(nowMs).toISOString();

  for (const s of asSegments(log.lunch_break_segments)) {
    addBreakWindow(windows, s.out, s.in);
  }

  for (const s of asSegments(log.tea_break_segments)) {
    addBreakWindow(windows, s.out, s.in);
  }

  // Fallback for older rows / single-break rows.
  addBreakWindow(
    windows,
    log.lunch_check_out_at ?? null,
    log.lunch_check_in_at ?? null,
  );

  addBreakWindow(
    windows,
    log.tea_check_out_at ?? null,
    log.tea_check_in_at ?? null,
  );

  // Running breaks. These are critical so active time does not keep increasing during lunch/tea.
  if (log.lunch_break_started_at) {
    addBreakWindow(windows, String(log.lunch_break_started_at), nowIso);
  }

  if (log.tea_break_started_at) {
    addBreakWindow(windows, String(log.tea_break_started_at), nowIso);
  }

  return mergeBreakWindows(windows);
}

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

function disconnectedSecondsFromSessions(
  rawSessions: any[],
  checkInAt: string | null,
  checkOutAt: string | null,
  nowMs: number,
  breakWindows: BreakWindow[] = [],
): number {
  if (!checkInAt) return 0;

  const graceMs = HEARTBEAT_GRACE_SECONDS * 1000;
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

    if (sessionStartMs > cursorMs + graceMs) {
      const gapStartMs = cursorMs + graceMs;
      const gapEndMs = sessionStartMs;
      const gapMs = Math.max(0, gapEndMs - gapStartMs);
      const breakMs = breakOverlapMs(gapStartMs, gapEndMs, breakWindows);

      disconnectedSeconds += Math.floor(Math.max(0, gapMs - breakMs) / 1000);
    }

    cursorMs = Math.max(cursorMs, sessionEndMs);
  }

  if (endMs > cursorMs + graceMs) {
    const gapStartMs = cursorMs + graceMs;
    const gapEndMs = endMs;
    const gapMs = Math.max(0, gapEndMs - gapStartMs);
    const breakMs = breakOverlapMs(gapStartMs, gapEndMs, breakWindows);

    disconnectedSeconds += Math.floor(Math.max(0, gapMs - breakMs) / 1000);
  }

  return Math.max(0, disconnectedSeconds);
}

/** Logged-in user’s attendance rows only. */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workDateRaw = searchParams.get("workDate") || "";
  const startRaw = searchParams.get("startDate") || "";
  const endRaw = searchParams.get("endDate") || "";

  const gate = await canUserMarkAttendance(supabase, session.id);

  if (!gate.ok) {
    return NextResponse.json({
      startDate: null,
      endDate: null,
      workDate: null,
      hasEmployee: false,
      timeZone: null,
      rows: [],
    });
  }

  const ctx = await getAttendanceContextForUser({
    supabase,
    companyId: gate.companyId,
    attendanceEmployeeId: gate.attendanceEmployeeId,
  });

  const todayTz = computeWorkDateForNow({
    now: new Date(),
    tz: ctx.timeZone,
    shiftStartTime: ctx.shiftStartTime,
    shiftEndTime: ctx.shiftEndTime,
    isNightShift: ctx.isNightShift,
  });

  let startDate: string;
  let endDate: string;

  if (isYmd(startRaw) && isYmd(endRaw)) {
    startDate = startRaw <= endRaw ? startRaw : endRaw;
    endDate = startRaw <= endRaw ? endRaw : startRaw;
  } else if (isYmd(workDateRaw)) {
    startDate = workDateRaw;
    endDate = workDateRaw;
  } else {
    startDate = todayTz;
    endDate = todayTz;
  }

  const workDate = startDate === endDate ? startDate : null;

  const { data: empMirror } = await supabase
    .from("HRMS_employees")
    .select("employee_code")
    .eq("company_id", gate.companyId)
    .eq("user_id", session.id)
    .maybeSingle();

  const { data: logs, error: logErr } = await supabase
    .from("HRMS_attendance_logs")
    .select(
      `
      id,
      employee_id,
      work_date,
      check_in_at,
      check_out_at,
      total_hours,
      lunch_break_minutes,
      tea_break_minutes,
      lunch_break_started_at,
      tea_break_started_at,
      lunch_check_out_at,
      lunch_check_in_at,
      tea_check_out_at,
      tea_check_in_at,
      lunch_break_segments,
      tea_break_segments,
      status,
      in_office,
      check_in_lat,
      check_in_lng,
      check_out_lat,
      check_out_lng,
      notes,
      agent_active_minutes,
      agent_idle_minutes,
      agent_disconnected_minutes,
      activity_purged_at
      `,
    )
    .eq("company_id", gate.companyId)
    .eq("employee_id", gate.attendanceEmployeeId)
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 400 });
  }

  const logIds = (logs ?? []).map((l: any) => String(l.id));

  const { data: sessions, error: sessionErr } = logIds.length
    ? await supabase
        .from("HRMS_activity_sessions")
        .select(
          "attendance_log_id, started_at, ended_at, last_heartbeat_at, active_seconds, idle_seconds, disconnected_seconds",
        )
        .eq("company_id", gate.companyId)
        .eq("employee_id", gate.attendanceEmployeeId)
        .in("attendance_log_id", logIds)
    : { data: [], error: null };

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 400 });
  }

  const sessionsByLog = new Map<string, any[]>();

  for (const s of sessions ?? []) {
    const logId = String((s as any).attendance_log_id ?? "");
    if (!logId) continue;

    const prev = sessionsByLog.get(logId) ?? [];
    prev.push(s);
    sessionsByLog.set(logId, prev);
  }

  const { data: u, error: uErr } = await supabase
    .from("HRMS_users")
    .select("id, name, email, role, employee_code")
    .eq("id", session.id)
    .maybeSingle();

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 400 });
  }

  const employeeCode =
    empMirror?.employee_code ??
    (u as { employee_code?: string | null })?.employee_code ??
    null;

  const nowMs = Date.now();

  const rows = (logs ?? []).map((log: any) => {
    const checkInMs = log.check_in_at
      ? new Date(String(log.check_in_at)).getTime()
      : null;

    const checkOutMs = log.check_out_at
      ? new Date(String(log.check_out_at)).getTime()
      : nowMs;

    const grossMin =
      checkInMs != null &&
      Number.isFinite(checkInMs) &&
      Number.isFinite(checkOutMs) &&
      checkOutMs > checkInMs
        ? Math.max(0, Math.round((checkOutMs - checkInMs) / 60000))
        : log.total_hours != null
          ? Math.max(0, Math.round(Number(log.total_hours) * 60))
          : null;

    const recordedLunchMin = Number(log.lunch_break_minutes) || 0;
    const recordedTeaMin = Number(log.tea_break_minutes) || 0;

    const lunchSpanMin = minutesBetween(
      log.lunch_check_out_at ?? null,
      log.lunch_check_in_at ?? null,
    );

    const teaSpanMin = minutesBetween(
      log.tea_check_out_at ?? null,
      log.tea_check_in_at ?? null,
    );

    const nowIso = new Date(nowMs).toISOString();

    /**
     * Important:
     * Do not check `!log.lunch_check_in_at` here.
     * If user has taken a previous lunch/tea segment, check_in_at may already exist.
     * Running break should depend only on `*_break_started_at`.
     */
    const runningLunchMin = log.lunch_break_started_at
      ? minutesBetween(String(log.lunch_break_started_at), nowIso)
      : 0;

    const runningTeaMin = log.tea_break_started_at
      ? minutesBetween(String(log.tea_break_started_at), nowIso)
      : 0;

    const lunchIdleMinBase = Math.max(
      recordedLunchMin,
      lunchSpanMin,
      runningLunchMin,
    );

    const teaIdleMinBase = Math.max(
      recordedTeaMin,
      teaSpanMin,
      runningTeaMin,
    );

    /**
     * Minimum 60-minute combined break policy applies only after final punch-out.
     * While lunch/tea is running, use actual running break so active time remains stable:
     * gross increases, break increases, active stays stable.
     */
    const shouldApplyCombinedBreakPolicy = Boolean(log.check_out_at);

    const effectiveBreak =
      grossMin != null && shouldApplyCombinedBreakPolicy
        ? effectiveCombinedBreakBreakdown({
            lunchMinutes: lunchIdleMinBase,
            teaMinutes: teaIdleMinBase,
            grossWorkMinutes: grossMin,
          })
        : {
            lunchBreakMinutes: lunchIdleMinBase,
            teaBreakMinutes: teaIdleMinBase,
            actualBreakMinutes: lunchIdleMinBase + teaIdleMinBase,
            countedBreakMinutes: lunchIdleMinBase + teaIdleMinBase,
            policyShortfallMinutes: 0,
          };

    const lunchIdleMin = effectiveBreak.lunchBreakMinutes;
    const teaIdleMin = effectiveBreak.teaBreakMinutes;
    const manualBreakIdleMinutes = Math.max(0, effectiveBreak.countedBreakMinutes);

    const logSessions = sessionsByLog.get(String(log.id)) ?? [];

    /**
     * After the 90-day retention purge runs the raw activity sessions
     * for this log are gone; switch to the persisted summary columns
     * stamped at freeze-time so the active-time figure stays stable.
     */
    const isPurged = log.activity_purged_at != null;

    const agentActiveSecondsLive = logSessions.reduce(
      (sum, s) => sum + (Number((s as any).active_seconds) || 0),
      0,
    );

    const agentIdleSecondsLive = logSessions.reduce(
      (sum, s) => sum + (Number((s as any).idle_seconds) || 0),
      0,
    );

    const storedDisconnectedSeconds = logSessions.reduce(
      (sum, s) => sum + (Number((s as any).disconnected_seconds) || 0),
      0,
    );

    const breakWindows = breakWindowsFromLog(log, nowMs);

    const calculatedDisconnectedSeconds = isPurged
      ? Math.max(0, Number(log.agent_disconnected_minutes) || 0) * 60
      : disconnectedSecondsFromSessions(
          logSessions,
          log.check_in_at,
          log.check_out_at,
          nowMs,
          breakWindows,
        );

    /**
     * Use calculated disconnected seconds because it excludes lunch/tea windows.
     * Using max(stored, calculated) can double-count lunch/tea as disconnected.
     */
    const disconnectedSeconds = calculatedDisconnectedSeconds;

    const agentActiveMinutes = isPurged
      ? Math.max(0, Number(log.agent_active_minutes) || 0)
      : Math.max(0, Math.round(agentActiveSecondsLive / 60));
    const agentIdleMinutes = isPurged
      ? Math.max(0, Number(log.agent_idle_minutes) || 0)
      : Math.max(0, Math.round(agentIdleSecondsLive / 60));
    const disconnectedMinutes = Math.max(0, Math.round(disconnectedSeconds / 60));
    const storedDisconnectedMinutes = isPurged
      ? Math.max(0, Number(log.agent_disconnected_minutes) || 0)
      : Math.max(0, Math.round(storedDisconnectedSeconds / 60));

    const idleMinutes =
      grossMin != null
        ? Math.max(
            0,
            manualBreakIdleMinutes + agentIdleMinutes + disconnectedMinutes,
          )
        : null;

    /**
     * Final active time should be gross minus:
     * - lunch/tea break
     * - agent idle time
     * - disconnected time, excluding break windows
     *
     * Do not replace this with `agentActiveMinutes`, because agent can start late,
     * restart, or pause during lunch/tea.
     */
    const calculatedActiveMinutes =
      grossMin != null
        ? Math.max(0, grossMin - (idleMinutes ?? 0))
        : null;

    const activeMinutes = calculatedActiveMinutes;

    return {
      logId: log.id,
      employeeId: log.employee_id,
      employeeCode: employeeCode ?? null,
      userId: session.id,
      employeeName: u?.name ?? null,
      employeeEmail: u?.email ?? "",

      workDate: log.work_date,
      checkInAt: log.check_in_at,
      lunchCheckOutAt: log.lunch_check_out_at ?? null,
      lunchCheckInAt: log.lunch_check_in_at ?? null,
      checkOutAt: log.check_out_at,

      totalHours:
        log.total_hours != null
          ? Number(log.total_hours)
          : grossMin != null
            ? Number((grossMin / 60).toFixed(2))
            : null,

      lunchBreakMinutes: lunchIdleMin,
      teaBreakMinutes: teaIdleMin,

      idleLunchMinutes: lunchIdleMin,
      idleTeaMinutes: teaIdleMin,
      manualBreakIdleMinutes,

      actualLunchBreakMinutes: lunchIdleMinBase,
      actualTeaBreakMinutes: teaIdleMinBase,
      actualBreakMinutes: effectiveBreak.actualBreakMinutes,
      policyBreakMinutes: effectiveBreak.countedBreakMinutes,
      policyBreakShortfallMinutes: effectiveBreak.policyShortfallMinutes,

      agentActiveMinutes,
      agentIdleMinutes,

      // Audit/debug fields
      storedDisconnectedSeconds,
      storedDisconnectedMinutes,

      disconnectedSeconds,
      disconnectedMinutes,
      idleMinutes,

      grossMinutes: grossMin,
      activeMinutes,
      meetsEightHourWork: activeMinutes != null && activeMinutes >= 8 * 60,

      lunchBreakOpen: !!log.lunch_break_started_at,
      teaBreakOpen: !!log.tea_break_started_at,
      lunchBreakStartedAt: log.lunch_break_started_at ?? null,
      teaBreakStartedAt: log.tea_break_started_at ?? null,

      status: log.status,
      inOffice: Boolean(log.in_office),
      checkInLat: log.check_in_lat ?? null,
      checkInLng: log.check_in_lng ?? null,
      checkOutLat: log.check_out_lat ?? null,
      checkOutLng: log.check_out_lng ?? null,
      notes: log.notes ?? null,
    };
  });

  rows.sort((a: any, b: any) => {
    const da = String(a.workDate || "");
    const db = String(b.workDate || "");
    return db.localeCompare(da);
  });

  return NextResponse.json({
    startDate,
    endDate,
    workDate,
    hasEmployee: true,
    timeZone: ctx.timeZone,
    rows,
  });
}