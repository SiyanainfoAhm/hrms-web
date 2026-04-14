import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveLunchBreakMinutes } from "@/lib/attendancePolicy";

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
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  let startDate: string;
  let endDate: string;
  if (isYmd(startRaw) && isYmd(endRaw)) {
    startDate = startRaw <= endRaw ? startRaw : endRaw;
    endDate = startRaw <= endRaw ? endRaw : startRaw;
  } else if (isYmd(workDateRaw)) {
    startDate = endDate = workDateRaw;
  } else {
    startDate = endDate = todayIst;
  }
  const workDate = startDate === endDate ? startDate : null;

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) {
    return NextResponse.json({
      startDate,
      endDate,
      workDate,
      hasEmployee: false,
      rows: [],
    });
  }

  const { data: emp, error: empErr } = await supabase
    .from("HRMS_employees")
    .select("id, user_id, employee_code")
    .eq("company_id", me.company_id)
    .eq("user_id", session.id)
    .maybeSingle();
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
  if (!emp?.id) {
    return NextResponse.json({
      startDate,
      endDate,
      workDate,
      hasEmployee: false,
      rows: [],
    });
  }

  const { data: logs, error: logErr } = await supabase
    .from("HRMS_attendance_logs")
    .select(
      "id, employee_id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at, status"
    )
    .eq("company_id", me.company_id)
    .eq("employee_id", emp.id)
    .gte("work_date", startDate)
    .lte("work_date", endDate);
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  const { data: u, error: uErr } = await supabase
    .from("HRMS_users")
    .select("id, name, email, role")
    .eq("id", session.id)
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });

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
      employeeCode: emp?.employee_code ?? null,
      userId: emp?.user_id ?? null,
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
    rows,
  });
}
