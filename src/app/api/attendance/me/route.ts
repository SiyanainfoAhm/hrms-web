import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveLunchBreakMinutes } from "@/lib/attendancePolicy";
import { canUserMarkAttendance } from "@/lib/attendanceEmployee";
import { computeWorkDateForNow, getAttendanceContextForUser } from "@/lib/attendanceTimeZone";

/** YYYY-MM-DD */
function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Logged-in user’s attendance rows only (same shape as /api/attendance/company rows). */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workDateRaw = searchParams.get("workDate") || "";
  const startRaw = searchParams.get("startDate") || "";
  const endRaw = searchParams.get("endDate") || "";

  let startDate: string;
  let endDate: string;
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

  if (isYmd(startRaw) && isYmd(endRaw)) {
    startDate = startRaw <= endRaw ? startRaw : endRaw;
    endDate = startRaw <= endRaw ? endRaw : startRaw;
  } else if (isYmd(workDateRaw)) {
    startDate = endDate = workDateRaw;
  } else {
    startDate = endDate = todayTz;
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
      "id, employee_id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at, status, in_office, check_in_lat, check_in_lng, check_out_lat, check_out_lng, notes"
    )
    .eq("company_id", gate.companyId)
    .eq("employee_id", gate.attendanceEmployeeId)
    .gte("work_date", startDate)
    .lte("work_date", endDate);
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  const { data: u, error: uErr } = await supabase
    .from("HRMS_users")
    .select("id, name, email, role, employee_code")
    .eq("id", session.id)
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
  const employeeCode = empMirror?.employee_code ?? (u as { employee_code?: string | null })?.employee_code ?? null;

  const rows = (logs ?? []).map((log: any) => {
    const grossMin =
      log.check_in_at && log.check_out_at
        ? Math.max(
            0,
            Math.round((new Date(log.check_out_at).getTime() - new Date(log.check_in_at).getTime()) / 60000)
          )
        : null;
    const recordedLunchMin = Number(log.lunch_break_minutes) || 0;
    const lunchOutAt = log.lunch_check_out_at ? new Date(String(log.lunch_check_out_at)).getTime() : null;
    const lunchInAt = log.lunch_check_in_at ? new Date(String(log.lunch_check_in_at)).getTime() : null;
    const lunchSpanMin =
      lunchOutAt != null && lunchInAt != null && Number.isFinite(lunchOutAt) && Number.isFinite(lunchInAt) && lunchInAt > lunchOutAt
        ? Math.round((lunchInAt - lunchOutAt) / 60000)
        : 0;
    const teaMin = Number(log.tea_break_minutes) || 0;
    const teaOutAt = log.tea_check_out_at ? new Date(String(log.tea_check_out_at)).getTime() : null;
    const teaInAt = log.tea_check_in_at ? new Date(String(log.tea_check_in_at)).getTime() : null;
    const teaSpanMin =
      teaOutAt != null && teaInAt != null && Number.isFinite(teaOutAt) && Number.isFinite(teaInAt) && teaInAt > teaOutAt
        ? Math.round((teaInAt - teaOutAt) / 60000)
        : 0;
    const lunchIdleMinBase = Math.max(recordedLunchMin, lunchSpanMin);
    const lunchMinEffective =
      grossMin != null
        ? effectiveLunchBreakMinutes({
            // Treat the lunch out→in span as idle (prevents counter drift and matches user expectation).
            recordedLunchMinutes: lunchIdleMinBase,
            lunchCheckOutAt: log.lunch_check_out_at,
            lunchCheckInAt: log.lunch_check_in_at,
            grossWorkMinutes: grossMin,
          })
        : recordedLunchMin;
    const lunchIdleMin = grossMin != null ? lunchMinEffective : lunchIdleMinBase;
    const teaIdleMin = Math.max(teaMin, teaSpanMin);
    const idleMinTotal = grossMin != null ? Math.max(0, lunchIdleMin + teaIdleMin) : null;
    const activeMin = grossMin != null ? Math.max(0, grossMin - (idleMinTotal ?? 0)) : null;
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
      totalHours: log.total_hours,
      lunchBreakMinutes: lunchIdleMin,
      teaBreakMinutes: teaIdleMin,
      idleMinutes: idleMinTotal,
      idleLunchMinutes: lunchIdleMin,
      idleTeaMinutes: teaIdleMin,
      lunchBreakOpen: !!log.lunch_break_started_at,
      teaBreakOpen: !!log.tea_break_started_at,
      status: log.status,
      grossMinutes: grossMin,
      activeMinutes: activeMin,
      meetsEightHourWork: activeMin != null && activeMin >= 8 * 60,
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
