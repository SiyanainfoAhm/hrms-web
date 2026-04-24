import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attendance rows use `HRMS_attendance_logs.employee_id`.
 * With the `HRMS_attendance_logs_employee_id_fkey` constraint enforced, this must always be
 * a valid `HRMS_employees.id`. If the employee mirror row doesn't exist, attendance cannot be marked.
 */
export async function attendanceEmployeeIdForUser(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<string | null> {
  const { data: emp } = await supabase
    .from("HRMS_employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (emp?.id) return String(emp.id);
  return null;
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
  if (!attendanceEmployeeId) return { ok: false };
  return { ok: true, companyId: u.company_id, attendanceEmployeeId };
}
