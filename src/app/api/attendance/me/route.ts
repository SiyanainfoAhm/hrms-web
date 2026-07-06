import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveCombinedBreakBreakdown } from "@/lib/attendancePolicy";
import {
  loadHalfDayLeaveDatesForUser,
  minimumCombinedBreakMinutesForWorkDate,
} from "@/lib/halfDayLeaveAttendance";
import {
  isOfficeLeaveAttendanceLog,
  officeLeaveMetrics,
} from "@/lib/officeLeaveAttendance";
import { canUserMarkAttendance } from "@/lib/attendanceEmployee";
import {
  computeWorkDateForNow,
  getAttendanceContextForUser,
} from "@/lib/attendanceTimeZone";
import { disconnectedSecondsFromSessions } from "@/lib/attendanceDisconnectedSeconds";
import {
  asBreakSegments,
  breakWindowsFromLog,
  grossMinutesFromAttendanceLog,
  lunchTeaBreakMinutesBase,
} from "@/lib/attendanceBreakUtils";

/** YYYY-MM-DD */
function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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
      is_office_leave,
      office_leave_request_id,
      office_leave_attachment_url,
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
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const halfDayLeaveDates = await loadHalfDayLeaveDatesForUser(
    supabase,
    gate.companyId,
    session.id,
    startDate,
    endDate,
  );

  const rows = (logs ?? []).map((log: any) => {
    if (isOfficeLeaveAttendanceLog(log)) {
      const ol = officeLeaveMetrics();
      return {
        logId: log.id,
        employeeId: log.employee_id,
        employeeCode: employeeCode ?? null,
        userId: session.id,
        employeeName: u?.name ?? null,
        employeeEmail: u?.email ?? "",
        workDate: log.work_date,
        checkInAt: log.check_in_at,
        lunchCheckOutAt: null,
        lunchCheckInAt: null,
        teaCheckOutAt: null,
        teaCheckInAt: null,
        lunchBreakSegments: null,
        teaBreakSegments: null,
        checkOutAt: log.check_out_at,
        totalHours: ol.grossMinutes / 60,
        lunchBreakMinutes: ol.lunchBreakMinutes,
        teaBreakMinutes: ol.teaBreakMinutes,
        idleLunchMinutes: ol.lunchBreakMinutes,
        idleTeaMinutes: 0,
        manualBreakIdleMinutes: ol.manualBreakIdleMinutes,
        actualLunchBreakMinutes: ol.lunchBreakMinutes,
        actualTeaBreakMinutes: 0,
        actualBreakMinutes: ol.manualBreakIdleMinutes,
        policyBreakMinutes: ol.manualBreakIdleMinutes,
        policyBreakShortfallMinutes: 0,
        agentActiveMinutes: ol.agentActiveMinutes,
        agentIdleMinutes: 0,
        storedDisconnectedSeconds: 0,
        storedDisconnectedMinutes: 0,
        disconnectedSeconds: 0,
        disconnectedMinutes: 0,
        idleMinutes: ol.idleMinutes,
        grossMinutes: ol.grossMinutes,
        activeMinutes: ol.activeMinutes,
        meetsEightHourWork: ol.meetsEightHourWork,
        lunchBreakOpen: false,
        teaBreakOpen: false,
        lunchBreakStartedAt: null,
        teaBreakStartedAt: null,
        status: log.status,
        inOffice: Boolean(log.in_office),
        checkInLat: log.check_in_lat ?? null,
        checkInLng: log.check_in_lng ?? null,
        checkOutLat: log.check_out_lat ?? null,
        checkOutLng: log.check_out_lng ?? null,
        notes: log.notes ?? null,
        isOfficeLeave: true,
        officeLeaveAttachmentUrl: log.office_leave_attachment_url ?? null,
      };
    }

    const workDateYmd = String(log.work_date ?? "").slice(0, 10);
    const minBreakMinutes = minimumCombinedBreakMinutesForWorkDate(workDateYmd, halfDayLeaveDates);
    const useNowForOpenShift =
      !log.check_out_at && String(log.work_date ?? "") === todayIst;

    const grossMin = grossMinutesFromAttendanceLog(log, { nowMs, useNowForOpenShift });

    const nowIso = new Date(nowMs).toISOString();
    const { lunchMinutes: lunchIdleMinBase, teaMinutes: teaIdleMinBase } =
      lunchTeaBreakMinutesBase(log, nowIso);

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
            minimumBreakMinutes: minBreakMinutes,
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
    // Floor (not round): 30–59s gaps after punch-in would otherwise show as a
    // full "1m idle" while gross is still small — confusing vs true offline time.
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
      employeeCode: employeeCode ?? null,
      userId: session.id,
      employeeName: u?.name ?? null,
      employeeEmail: u?.email ?? "",

      workDate: log.work_date,
      checkInAt: log.check_in_at,
      lunchCheckOutAt: log.lunch_check_out_at ?? null,
      lunchCheckInAt: log.lunch_check_in_at ?? null,
      teaCheckOutAt: log.tea_check_out_at ?? null,
      teaCheckInAt: log.tea_check_in_at ?? null,
      lunchBreakSegments: asBreakSegments(log.lunch_break_segments),
      teaBreakSegments: asBreakSegments(log.tea_break_segments),
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
      isOfficeLeave: false,
      officeLeaveAttachmentUrl: null,
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