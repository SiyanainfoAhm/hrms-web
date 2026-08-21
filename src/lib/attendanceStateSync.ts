import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceAgentStatus = "ACTIVE" | "LUNCH" | "BREAK" | "INACTIVE";

/**
 * Keep `HRMS_attendance_state` aligned with the current attendance log so the
 * desktop agent attaches screenshots / sessions to the right `attendance_log_id`.
 *
 * Supabase-js does not throw on PostgREST errors — always check `error`.
 */
export async function upsertAttendanceState(
  client: SupabaseClient,
  args: {
    companyId: string;
    employeeId: string;
    attendanceLogId: string | null;
    workDate: string;
    status: AttendanceAgentStatus;
    updatedAtIso: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from("HRMS_attendance_state").upsert(
    {
      company_id: args.companyId,
      employee_id: args.employeeId,
      attendance_log_id: args.attendanceLogId,
      work_date: args.workDate,
      status: args.status,
      updated_at: args.updatedAtIso,
    } as any,
    { onConflict: "company_id,employee_id" },
  );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[attendance_state] upsert failed", {
        employeeId: args.employeeId,
        attendanceLogId: args.attendanceLogId,
        workDate: args.workDate,
        status: args.status,
        error: error.message,
      });
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/**
 * If the employee has an open punch-in but agent state still points at an old
 * (or null) log, repair it. Safe to call on every /api/attendance/me load.
 */
export async function repairOpenAttendanceState(
  client: SupabaseClient,
  args: {
    companyId: string;
    employeeId: string;
    openLog: {
      id: string;
      work_date: string;
      lunch_break_started_at?: string | null;
      tea_break_started_at?: string | null;
      check_out_at?: string | null;
    } | null;
  },
): Promise<void> {
  const log = args.openLog;
  if (!log?.id || log.check_out_at) return;

  const { data: st, error: stErr } = await client
    .from("HRMS_attendance_state")
    .select("attendance_log_id, work_date, status")
    .eq("company_id", args.companyId)
    .eq("employee_id", args.employeeId)
    .maybeSingle();

  if (stErr) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[attendance_state] read failed", stErr.message);
    }
    return;
  }

  const currentLogId = st?.attendance_log_id ? String(st.attendance_log_id) : "";
  const desiredLogId = String(log.id);
  const workDate = String(log.work_date).slice(0, 10);
  const status: AttendanceAgentStatus = log.lunch_break_started_at
    ? "LUNCH"
    : log.tea_break_started_at
      ? "BREAK"
      : "ACTIVE";

  if (
    currentLogId === desiredLogId &&
    String((st as any)?.work_date ?? "").slice(0, 10) === workDate &&
    String((st as any)?.status ?? "") === status
  ) {
    return;
  }

  await upsertAttendanceState(client, {
    companyId: args.companyId,
    employeeId: args.employeeId,
    attendanceLogId: desiredLogId,
    workDate,
    status,
    updatedAtIso: new Date().toISOString(),
  });

  if (process.env.NODE_ENV === "development") {
    console.debug("[attendance_state] repaired open shift link", {
      employeeId: args.employeeId,
      fromLogId: currentLogId || null,
      toLogId: desiredLogId,
      workDate,
      status,
    });
  }
}
