import type { SupabaseClient } from "@supabase/supabase-js";

export type EmployeeMirrorRow = { id: string; department_id: string | null };

function splitName(raw: string | null | undefined, email: string | null | undefined): { firstName: string; lastName: string | null } {
  const fallbackFirst = (email?.split("@")[0] || "Employee").slice(0, 100);
  const parts = String(raw ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = (parts[0] || fallbackFirst).slice(0, 100);
  const lastName = parts.length > 1 ? parts.slice(1).join(" ").slice(0, 100) || null : null;
  return { firstName, lastName };
}

/**
 * Some tables (leave, reimbursements, attendance logs) still reference `HRMS_employees.id`.
 * When the mirror row is missing but `HRMS_users` is complete, create a minimal mirror row
 * so those flows work without a separate manual `HRMS_employees` onboarding step.
 */
export async function ensureEmployeeMirrorForUser(
  supabase: SupabaseClient,
  companyId: string,
  userId: string
): Promise<{ ok: true; row: EmployeeMirrorRow } | { ok: false; error: string }> {
  const { data: existing, error: exErr } = await supabase
    .from("HRMS_employees")
    .select("id, department_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, row: { id: String(existing.id), department_id: (existing as any).department_id ?? null } };

  const { data: u, error: uErr } = await supabase
    .from("HRMS_users")
    .select(
      "id, company_id, email, name, employee_code, phone, date_of_joining, employment_status, department_id, division_id, shift_id, designation_id, emergency_contact_name, emergency_contact_phone, bank_account_number, bank_ifsc"
    )
    .eq("id", userId)
    .maybeSingle();
  if (uErr) return { ok: false, error: uErr.message };
  if (!u || (u as any).company_id !== companyId) {
    return { ok: false, error: "User not found in this company" };
  }

  const email = String((u as any).email ?? "").trim();
  if (!email) return { ok: false, error: "User email is required to create employee mirror record" };

  const { firstName, lastName } = splitName((u as any).name as string | null, email);
  const isActive = String((u as any).employment_status ?? "") !== "past";

  const payload = {
    user_id: userId,
    company_id: companyId,
    employee_code: (u as any).employee_code != null && String((u as any).employee_code).trim() ? String((u as any).employee_code).trim() : null,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: (u as any).phone != null && String((u as any).phone).trim() ? String((u as any).phone).trim() : null,
    date_of_joining: (u as any).date_of_joining ? String((u as any).date_of_joining) : null,
    emergency_contact_name: (u as any).emergency_contact_name ?? null,
    emergency_contact_phone: (u as any).emergency_contact_phone ?? null,
    bank_account_number: (u as any).bank_account_number ?? null,
    bank_ifsc: (u as any).bank_ifsc ?? null,
    is_active: isActive,
    designation_id: (u as any).designation_id ?? null,
    department_id: (u as any).department_id ?? null,
    division_id: (u as any).division_id ?? null,
    shift_id: (u as any).shift_id ?? null,
  };

  const { data: inserted, error: insErr } = await supabase.from("HRMS_employees").insert([payload]).select("id, department_id").single();
  if (!insErr && inserted?.id) {
    return { ok: true, row: { id: String(inserted.id), department_id: (inserted as any).department_id ?? null } };
  }

  // Race: another request may have inserted the mirror row between select and insert.
  const { data: again, error: againErr } = await supabase
    .from("HRMS_employees")
    .select("id, department_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (againErr) return { ok: false, error: againErr.message };
  if (again?.id) return { ok: true, row: { id: String(again.id), department_id: (again as any).department_id ?? null } };

  return { ok: false, error: insErr?.message || "Failed to create employee mirror record" };
}
