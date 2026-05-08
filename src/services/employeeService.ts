/**
 * Wrapper around /api/employees. The route already enforces:
 *   - role-based access (super_admin / admin / hr can list directory)
 *   - same-company scoping
 * so the chatbot search call inherits all of those rules.
 */

export type EmployeeDirectoryRow = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  employee_code?: string | null;
  department_name?: string | null;
  designation_title?: string | null;
  role?: string | null;
  employment_status?: string | null;
};

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg = typeof (data as { error?: unknown }).error === "string"
      ? String((data as { error?: unknown }).error)
      : fallback;
    throw new Error(msg);
  }
  return data as T;
}

export async function listEmployees(): Promise<EmployeeDirectoryRow[]> {
  const res = await fetch("/api/employees");
  const data = await jsonOrThrow<{ employees?: EmployeeDirectoryRow[]; rows?: EmployeeDirectoryRow[] }>(
    res,
    "Failed to load employees",
  );
  return Array.isArray(data.employees) ? data.employees : Array.isArray(data.rows) ? data.rows : [];
}

/** Client-side search across name/email/code; the existing /api/employees
 * route returns the company directory in one shot, so filtering here keeps
 * us from inventing a new endpoint. */
export async function searchEmployees(query: string, limit = 8): Promise<EmployeeDirectoryRow[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await listEmployees();
  const match = (s: string | null | undefined) => (s ?? "").toString().toLowerCase().includes(q);
  return all
    .filter((e) => match(e.name) || match(e.email) || match(e.employee_code))
    .slice(0, limit);
}
