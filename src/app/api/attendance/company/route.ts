import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveCombinedBreakBreakdown } from "@/lib/attendancePolicy";
import { attendanceEmployeeIdForUser } from "@/lib/attendanceEmployee";
import { disconnectedSecondsFromSessions } from "@/lib/attendanceDisconnectedSeconds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

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

type ShiftKind = "all" | "day" | "night";

function parseShiftKind(v: string | null): ShiftKind {
  const x = String(v ?? "").trim().toLowerCase();
  if (x === "day") return "day";
  if (x === "night") return "night";
  return "all";
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerial(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const workDateRaw = searchParams.get("workDate") || "";
  const startRaw = searchParams.get("startDate") || "";
  const endRaw = searchParams.get("endDate") || "";
  const userIdFilter = searchParams.get("userId")?.trim() || "";
  const shiftKind = parseShiftKind(searchParams.get("shiftKind"));

  const todayIst = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
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
    startDate = todayIst;
    endDate = todayIst;
  }

  const workDate = startDate === endDate ? startDate : null;

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();

  if (meErr) {
    return NextResponse.json({ error: meErr.message }, { status: 400 });
  }

  if (!me?.company_id) {
    return NextResponse.json({ startDate, endDate, workDate, rows: [] });
  }

  let filterEmployeeId: string | null = null;

  if (userIdFilter) {
    filterEmployeeId = await attendanceEmployeeIdForUser(
      supabase,
      me.company_id,
      userIdFilter,
    );

    if (!filterEmployeeId) {
      return NextResponse.json({
        startDate,
        endDate,
        workDate,
        rows: [],
        error: "Selected user is not linked to an employee profile (HRMS_employees).",
      });
    }
  }

  let allowedEmployeeIds: string[] | null = null;

  if (shiftKind !== "all" && !filterEmployeeId) {
    const { data: empsAll, error: empsAllErr } = await supabase
      .from("HRMS_employees")
      .select("id, shift_id")
      .eq("company_id", me.company_id);

    if (empsAllErr) {
      return NextResponse.json({ error: empsAllErr.message }, { status: 400 });
    }

    const shiftIds = [
      ...new Set((empsAll ?? []).map((e: any) => e.shift_id).filter(Boolean)),
    ].map(String);

    const { data: shifts, error: shErr } = shiftIds.length
      ? await supabase
          .from("HRMS_shifts")
          .select("id, is_night_shift")
          .eq("company_id", me.company_id)
          .in("id", shiftIds)
      : { data: [], error: null };

    if (shErr) {
      return NextResponse.json({ error: shErr.message }, { status: 400 });
    }

    const nightByShiftId = new Map(
      (shifts ?? []).map((s: any) => [String(s.id), Boolean(s.is_night_shift)]),
    );

    allowedEmployeeIds = (empsAll ?? [])
      .filter((e: any) => {
        const sid = e.shift_id != null ? String(e.shift_id) : "";
        const isNight = sid ? nightByShiftId.get(sid) === true : false;
        return shiftKind === "night" ? isNight : !isNight;
      })
      .map((e: any) => String(e.id))
      .filter(Boolean);
  }

  let logQuery = supabase
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
    .eq("company_id", me.company_id)
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (filterEmployeeId) {
    logQuery = logQuery.eq("employee_id", filterEmployeeId);
  } else if (allowedEmployeeIds) {
    if (allowedEmployeeIds.length === 0) {
      return NextResponse.json({ startDate, endDate, workDate, rows: [] });
    }

    logQuery = logQuery.in("employee_id", allowedEmployeeIds);
  }

  const { data: logs, error: logErr } = await logQuery;

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 400 });
  }

  const empIds = [
    ...new Set((logs ?? []).map((l: any) => l.employee_id).filter(Boolean)),
  ].map(String);

  if (!empIds.length) {
    return NextResponse.json({ startDate, endDate, workDate, rows: [] });
  }

  const logIds = (logs ?? []).map((l: any) => String(l.id));

  const { data: sessions, error: sessionErr } = logIds.length
    ? await supabase
        .from("HRMS_activity_sessions")
        .select(
          "attendance_log_id, started_at, ended_at, last_heartbeat_at, active_seconds, idle_seconds, disconnected_seconds",
        )
        .eq("company_id", me.company_id)
        .in("attendance_log_id", logIds)
    : { data: [], error: null };

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 400 });
  }

  /**
   * Fetch screenshot counts per attendance log so the table can show a
   * "Screenshots (N)" trigger only when there's something to view. We use
   * a lightweight `id, attendance_log_id` projection here and tally on the
   * server. The actual signed URLs are loaded on demand from the
   * `/api/attendance/screenshots` endpoint when the dialog opens.
   */
  const { data: screenshotRefs, error: screenshotRefsErr } = logIds.length
    ? await supabase
        .from("HRMS_activity_screenshots")
        .select("id, attendance_log_id")
        .eq("company_id", me.company_id)
        .in("attendance_log_id", logIds)
    : { data: [], error: null };

  if (screenshotRefsErr) {
    return NextResponse.json({ error: screenshotRefsErr.message }, { status: 400 });
  }

  const screenshotCountByLog = new Map<string, number>();
  for (const s of screenshotRefs ?? []) {
    const k = String((s as any).attendance_log_id ?? "");
    if (!k) continue;
    screenshotCountByLog.set(k, (screenshotCountByLog.get(k) ?? 0) + 1);
  }

  const sessionsByLog = new Map<string, any[]>();

  for (const s of sessions ?? []) {
    const logId = String((s as any).attendance_log_id ?? "");
    if (!logId) continue;

    const prev = sessionsByLog.get(logId) ?? [];
    prev.push(s);
    sessionsByLog.set(logId, prev);
  }

  const { data: emps, error: empErr } = await supabase
    .from("HRMS_employees")
    .select("id, user_id, employee_code")
    .eq("company_id", me.company_id)
    .in("id", empIds);

  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 400 });
  }

  const matchedEmpIds = new Set((emps ?? []).map((e: any) => String(e.id)));
  const orphanEmployeeIds = empIds.filter((id) => !matchedEmpIds.has(id));

  const userIdsFromEmps = [
    ...new Set((emps ?? []).map((e: any) => e.user_id).filter(Boolean)),
  ].map(String);

  const { data: usersFromEmps, error: usersFromEmpsErr } = userIdsFromEmps.length
    ? await supabase
        .from("HRMS_users")
        .select("id, name, email, role, employee_code")
        .in("id", userIdsFromEmps)
    : { data: [], error: null };

  if (usersFromEmpsErr) {
    return NextResponse.json({ error: usersFromEmpsErr.message }, { status: 400 });
  }

  const { data: usersDirect, error: usersDirectErr } =
    orphanEmployeeIds.length > 0
      ? await supabase
          .from("HRMS_users")
          .select("id, name, email, role, employee_code")
          .eq("company_id", me.company_id)
          .in("id", orphanEmployeeIds)
      : { data: [], error: null };

  if (usersDirectErr) {
    return NextResponse.json({ error: usersDirectErr.message }, { status: 400 });
  }

  const userById = new Map([
    ...(usersFromEmps ?? []).map((u: any) => [String(u.id), u] as const),
    ...(usersDirect ?? []).map((u: any) => [String(u.id), u] as const),
  ]);

  const empById = new Map((emps ?? []).map((e: any) => [String(e.id), e]));

  const nowMs = Date.now();

  const rows = (logs ?? [])
    .map((log: any) => {
      const emp = empById.get(String(log.employee_id));

      const u = emp?.user_id
        ? userById.get(String(emp.user_id))
        : userById.get(String(log.employee_id)) ?? null;

      if (u?.role === "super_admin") return null;

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
       * Once `activity_purged_at` is set the raw session rows for this
       * log have been removed by the retention cron. Use the persisted
       * summary columns on the attendance log instead — they were
       * frozen at that moment so the displayed active time stays
       * stable forever.
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
      // Floor: short post-punch-in gaps (common before the first session heartbeat)
      // must not round up to a full minute of "idle" in the first few gross minutes.
      const disconnectedMinutes = Math.max(0, Math.floor(disconnectedSeconds / 60));

      const storedDisconnectedMinutes = isPurged
        ? Math.max(0, Number(log.agent_disconnected_minutes) || 0)
        : Math.max(0, Math.floor(storedDisconnectedSeconds / 60));

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
        employeeCode:
          emp?.employee_code ??
          (u as { employee_code?: string | null } | null)?.employee_code ??
          null,
        userId: emp?.user_id ?? (u?.id as string | undefined) ?? null,
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
        screenshotCount: screenshotCountByLog.get(String(log.id)) ?? 0,
      };
    })
    .filter(Boolean);

  rows.sort((a: any, b: any) => {
    const da = String(a.workDate || "");
    const db = String(b.workDate || "");

    if (da !== db) return db.localeCompare(da);

    return String(a.employeeName || a.employeeEmail).localeCompare(
      String(b.employeeName || b.employeeEmail),
    );
  });

  return NextResponse.json({ startDate, endDate, workDate, rows });
}