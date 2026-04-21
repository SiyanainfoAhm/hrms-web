import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attendance rows use `HRMS_attendance_logs.employee_id`.
 * Prefer `HRMS_employees.id` when a mirror row exists; otherwise use the user's id (HRMS_users.id).
 */
export async function attendanceEmployeeIdForUser(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<string> {
  const { data: emp } = await supabase
    .from("HRMS_employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (emp?.id) return String(emp.id);
  return userId;
}

export async function canUserMarkAttendance(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; companyId: string; attendanceEmployeeId: string } | { ok: false }> {
  const { data: u, error } = await supabase
    .from("HRMS_users")
    .select("company_id, employment_status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !u?.company_id) return { ok: false };
  if (String(u.employment_status ?? "") !== "current") return { ok: false };
  const attendanceEmployeeId = await attendanceEmployeeIdForUser(supabase, u.company_id, userId);
  return { ok: true, companyId: u.company_id, attendanceEmployeeId };
}
