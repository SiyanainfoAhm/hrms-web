import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { canUserMarkAttendance } from "@/lib/attendanceEmployee";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await canUserMarkAttendance(supabase, session.id);
  if (!gate.ok) {
    return NextResponse.json({ ok: true, heartbeat: null, attendanceState: null });
  }

  const [{ data: hb }, { data: st }] = await Promise.all([
    supabase
      .from("HRMS_agent_heartbeat")
      .select("status, last_seen_at, app_version, device_name, attendance_log_id")
      .eq("company_id", gate.companyId)
      .eq("employee_id", gate.attendanceEmployeeId)
      .maybeSingle(),
    supabase
      .from("HRMS_attendance_state")
      .select("status, updated_at, attendance_log_id, work_date")
      .eq("company_id", gate.companyId)
      .eq("employee_id", gate.attendanceEmployeeId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    heartbeat: hb
      ? {
          status: (hb as any).status ?? "ONLINE",
          lastSeenAt: (hb as any).last_seen_at ? new Date((hb as any).last_seen_at).toISOString() : null,
          appVersion: (hb as any).app_version ?? null,
          deviceName: (hb as any).device_name ?? null,
          attendanceLogId: (hb as any).attendance_log_id ?? null,
        }
      : null,
    attendanceState: st
      ? {
          status: (st as any).status ?? null,
          updatedAt: (st as any).updated_at ? new Date((st as any).updated_at).toISOString() : null,
          attendanceLogId: (st as any).attendance_log_id ?? null,
          workDate: (st as any).work_date ? String((st as any).work_date) : null,
        }
      : null,
  });
}

