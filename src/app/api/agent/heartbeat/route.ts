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

  // Newer desktop agents update their open activity session on each activity
  // report.  Older agents also update HRMS_agent_heartbeat.  Use whichever is
  // newest so an updated, running agent is not shown as disconnected merely
  // because it no longer writes the legacy heartbeat row.
  const [{ data: activitySession }, { data: settings }] = await Promise.all([
    supabase
      .from("HRMS_activity_sessions")
      .select("started_at, last_heartbeat_at")
      .eq("company_id", gate.companyId)
      .eq("employee_id", gate.attendanceEmployeeId)
      .is("ended_at", null)
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("HRMS_agent_settings")
      .select("screenshot_interval_seconds")
      .eq("company_id", gate.companyId)
      .maybeSingle(),
  ]);

  const heartbeatMs = (hb as any)?.last_seen_at ? new Date((hb as any).last_seen_at).getTime() : NaN;
  const activityLastSeen = (activitySession as any)?.last_heartbeat_at ?? (activitySession as any)?.started_at ?? null;
  const activityMs = activityLastSeen ? new Date(activityLastSeen).getTime() : NaN;
  const lastSeenMs = Math.max(Number.isFinite(heartbeatMs) ? heartbeatMs : -Infinity, Number.isFinite(activityMs) ? activityMs : -Infinity);
  const lastSeenAt = Number.isFinite(lastSeenMs) ? new Date(lastSeenMs).toISOString() : null;
  // Activity reports may be sent on the configured screenshot cadence. Add a
  // small network/scheduling allowance rather than assuming a fixed minute.
  const reportIntervalSeconds = Math.max(30, Number((settings as any)?.screenshot_interval_seconds) || 300);
  const connectionTimeoutSeconds = reportIntervalSeconds + 90;
  const connected = lastSeenAt !== null && Date.now() - lastSeenMs <= connectionTimeoutSeconds * 1000;

  return NextResponse.json({
    ok: true,
    heartbeat: hb || activitySession
      ? {
          status: (hb as any).status ?? "ONLINE",
          connected,
          connectionTimeoutSeconds,
          lastSeenAt,
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

/**
 * Desktop agents use this authenticated route because HRMS tables are closed
 * to direct Supabase clients under RLS. The bearer value is the signed,
 * session-versioned token returned at desktop sign-in; company and employee
 * identity are always derived on the server.
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const session = await getValidatedSession(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await canUserMarkAttendance(supabase, session.id);
  if (!gate.ok) return NextResponse.json({ error: "Attendance is unavailable for this account." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const appVersion = typeof body?.appVersion === "string" ? body.appVersion.slice(0, 120) : null;
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName.slice(0, 160) : null;

  const { error } = await supabase.from("HRMS_agent_heartbeat").upsert(
    {
      company_id: gate.companyId,
      employee_id: gate.attendanceEmployeeId,
      status: "ONLINE",
      last_seen_at: new Date().toISOString(),
      app_version: appVersion,
      device_name: deviceName,
    },
    { onConflict: "company_id,employee_id" },
  );
  if (error) {
    console.error("Desktop agent heartbeat upsert failed:", error.message);
    return NextResponse.json({ error: "Could not record agent heartbeat." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    companyId: gate.companyId,
    employeeId: gate.attendanceEmployeeId,
  });
}

