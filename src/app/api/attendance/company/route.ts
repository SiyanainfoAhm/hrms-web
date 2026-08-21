import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { effectiveCombinedBreakBreakdown } from "@/lib/attendancePolicy";
import {
  loadHalfDayLeaveDatesByUserId,
  minimumCombinedBreakMinutesForWorkDate,
} from "@/lib/halfDayLeaveAttendance";
import {
  isOfficeLeaveAttendanceLog,
  officeLeaveMetrics,
} from "@/lib/officeLeaveAttendance";
import { attendanceEmployeeIdForUser } from "@/lib/attendanceEmployee";
import { disconnectedSecondsFromSessions } from "@/lib/attendanceDisconnectedSeconds";
import {
  asBreakSegments,
  breakWindowsFromLog,
  grossMinutesFromAttendanceLog,
  lunchTeaBreakMinutesBase,
} from "@/lib/attendanceBreakUtils";
import {
  aggregateActivitySeconds,
  clampActivityMinutesToGross,
  groupSessionsByLogId,
  idleMinutesFromGrossActiveBreak,
} from "@/lib/attendanceActivityAggregate";
import { loadActivitySessionsForLogIds } from "@/lib/attendanceActivitySessions";
import { screenshotRowHasMedia } from "@/lib/attendanceScreenshotUrl";

/**
 * Count screenshots per attendance log. Uses the service role so RLS cannot
 * hide agent-written rows from managerial company attendance.
 *
 * Media may live in `file_url`, `storage_path` (Azure URL or key), or
 * `file_path` — we count any row that has at least one of those.
 */
async function loadScreenshotCountByLogId(
  companyId: string,
  logIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!logIds.length) return counts;

  const LOG_CHUNK = 80;
  const PAGE = 1000;

  for (let i = 0; i < logIds.length; i += LOG_CHUNK) {
    const chunk = logIds.slice(i, i + LOG_CHUNK);
    let from = 0;

    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("HRMS_activity_screenshots")
        .select("id, attendance_log_id, storage_path, file_url, file_path")
        .eq("company_id", companyId)
        .in("attendance_log_id", chunk)
        .range(from, from + PAGE - 1);

      if (error) {
        // Older DBs may lack file_url / file_path — fall back to storage_path only.
        const msg = String(error.message || "");
        if (/file_url|file_path|column/i.test(msg)) {
          const fallback = await supabaseAdmin
            .from("HRMS_activity_screenshots")
            .select("id, attendance_log_id, storage_path")
            .eq("company_id", companyId)
            .in("attendance_log_id", chunk)
            .range(from, from + PAGE - 1);
          if (fallback.error) throw fallback.error;
          for (const s of fallback.data ?? []) {
            const k = String((s as any).attendance_log_id ?? "");
            if (!k || !screenshotRowHasMedia(s as any)) continue;
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          if ((fallback.data ?? []).length < PAGE) break;
          from += PAGE;
          continue;
        }
        throw error;
      }

      for (const s of data ?? []) {
        const k = String((s as any).attendance_log_id ?? "");
        if (!k || !(s as any).id) continue;
        if (!screenshotRowHasMedia(s as any)) continue;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }

      if ((data ?? []).length < PAGE) break;
      from += PAGE;
    }
  }

  return counts;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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
      is_office_leave,
      office_leave_request_id,
      office_leave_attachment_url,
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

  let sessions: Awaited<ReturnType<typeof loadActivitySessionsForLogIds>> = [];
  try {
    sessions = logIds.length
      ? await loadActivitySessionsForLogIds(supabaseAdmin, logIds)
      : [];
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load activity sessions";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  /**
   * Fetch screenshot counts per attendance log so the table can show a
   * "View (N)" trigger only when there's something to view. Service-role
   * read + pagination; actual image URLs load on demand from
   * `/api/attendance/screenshots`.
   */
  let screenshotCountByLog = new Map<string, number>();
  try {
    screenshotCountByLog = await loadScreenshotCountByLogId(me.company_id, logIds);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load screenshot counts";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development" && logIds.length) {
    console.debug("[attendance/company] screenshot counts", {
      logCount: logIds.length,
      sessionRows: sessions.length,
      logsWithScreenshots: [...screenshotCountByLog.entries()].filter(([, n]) => n > 0).length,
      sample: [...screenshotCountByLog.entries()].slice(0, 5),
    });
  }

  const sessionsByLog = groupSessionsByLogId(sessions);

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

  const halfDayLeaveDatesByUser = await loadHalfDayLeaveDatesByUserId(
    supabase,
    me.company_id,
    userIdsFromEmps,
    startDate,
    endDate,
  );

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

      if (isOfficeLeaveAttendanceLog(log)) {
        const ol = officeLeaveMetrics();
        return {
          logId: log.id,
          employeeId: log.employee_id,
          employeeName: u?.name ?? null,
          employeeEmail: u?.email ?? "",
          workDate: log.work_date,
          checkInAt: null,
          lunchCheckOutAt: null,
          lunchCheckInAt: null,
          teaCheckOutAt: null,
          teaCheckInAt: null,
          lunchBreakSegments: null,
          teaBreakSegments: null,
          checkOutAt: null,
          totalHours: ol.grossMinutes / 60,
          lunchBreakMinutes: ol.lunchBreakMinutes,
          teaBreakMinutes: ol.teaBreakMinutes,
          idleLunchMinutes: ol.lunchBreakMinutes,
          idleTeaMinutes: 0,
          manualBreakIdleMinutes: ol.manualBreakIdleMinutes,
          grossMinutes: ol.grossMinutes,
          activeMinutes: ol.activeMinutes,
          idleMinutes: ol.idleMinutes,
          meetsEightHourWork: ol.meetsEightHourWork,
          lunchBreakOpen: false,
          teaBreakOpen: false,
          status: log.status,
          inOffice: Boolean(log.in_office),
          notes: log.notes ?? null,
          screenshotCount: screenshotCountByLog.get(String(log.id)) ?? 0,
          isOfficeLeave: true,
          officeLeaveAttachmentUrl: log.office_leave_attachment_url ?? null,
        };
      }

      const useNowForOpenShift =
        !log.check_out_at && String(log.work_date ?? "") === todayIst && endDate === todayIst;

      const grossMin = grossMinutesFromAttendanceLog(log, { nowMs, useNowForOpenShift });
      const userIdForLeave = emp?.user_id ? String(emp.user_id) : String(log.employee_id);
      const workDateYmd = String(log.work_date ?? "").slice(0, 10);
      const minBreakMinutes = minimumCombinedBreakMinutesForWorkDate(
        workDateYmd,
        halfDayLeaveDatesByUser.get(userIdForLeave),
      );

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
       * Once `activity_purged_at` is set the raw session rows for this
       * log have been removed by the retention cron. Use the persisted
       * summary columns on the attendance log instead.
       */
      const isPurged = log.activity_purged_at != null;

      const activity = aggregateActivitySeconds(logSessions);
      const activityActiveSeconds = activity.activeSeconds;
      const activityIdleSeconds = activity.idleSeconds;
      const storedDisconnectedSeconds = activity.disconnectedSecondsStored;

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

      /** Audit only — never fold disconnect gaps into displayed Idle. */
      const disconnectedSeconds = calculatedDisconnectedSeconds;

      /**
       * Active = SUM(active_seconds) from HRMS_activity_sessions, capped ≤ Gross.
       * Idle  = Gross − Active − Lunch/Tea  (remainder of the shift).
       * agent idle_seconds kept as audit only (agentIdleMinutes).
       */
      const activeMinutesRaw = isPurged
        ? Math.max(0, Number(log.agent_active_minutes) || 0)
        : Math.max(0, Math.floor(activityActiveSeconds / 60));
      const activeMinutes = clampActivityMinutesToGross(activeMinutesRaw, grossMin);
      const idleMinutes = idleMinutesFromGrossActiveBreak({
        grossMinutes: grossMin,
        activeMinutes,
        breakMinutes: manualBreakIdleMinutes,
      });

      const agentActiveMinutes = activeMinutes;
      const agentIdleMinutes = isPurged
        ? Math.max(0, Number(log.agent_idle_minutes) || 0)
        : Math.max(0, Math.floor(activityIdleSeconds / 60));
      const disconnectedMinutes = Math.max(0, Math.floor(disconnectedSeconds / 60));
      const storedDisconnectedMinutes = isPurged
        ? Math.max(0, Number(log.agent_disconnected_minutes) || 0)
        : Math.max(0, Math.floor(storedDisconnectedSeconds / 60));

      const grossSeconds = grossMin != null ? Math.max(0, grossMin) * 60 : null;

      console.debug("[attendance/company] activity totals", {
        attendance_log_id: log.id,
        employeeName: u?.name ?? null,
        gross_seconds: grossSeconds,
        activity_active_seconds: activityActiveSeconds,
        activity_idle_seconds: activityIdleSeconds,
        break_minutes: manualBreakIdleMinutes,
        final_active_minutes: activeMinutes,
        final_idle_minutes: idleMinutes,
        sessions_count: activity.sessionCount,
      });

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
        screenshotCount: screenshotCountByLog.get(String(log.id)) ?? 0,
        isOfficeLeave: false,
        officeLeaveAttachmentUrl: null,
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