import { roleConfig, type PermissionId, type RoleId } from "@/config/roleConfig";

/** Built-in company roles seeded with is_default — cannot edit or delete. */
export const BUILTIN_ROLE_KEYS = new Set<RoleId>(["super_admin", "admin", "hr", "manager"]);

/** Access levels assignable when creating a custom role. */
export const CUSTOM_ROLE_ACCESS_LEVELS: RoleId[] = ["employee", "manager", "hr", "admin"];

export const permissionLabels: Record<PermissionId, string> = {
  "app.view": "Use the app",
  "employees.directory": "Employee directory",
  "employees.write": "Add / edit employees",
  "employees.delete": "Delete employees",
  "attendance.view": "Attendance",
  "payroll.view": "Payroll (view)",
  "payroll.admin": "Payroll (admin)",
  "approvals.view": "Approvals (view)",
  "approvals.act": "Approvals (act)",
  "holidays.view": "Holidays",
  "settings.view": "Settings",
  "settings.company": "Company settings",
};

export function isBuiltInCompanyRole(row: { is_default?: boolean | null; role_key?: string | null }): boolean {
  return row.is_default === true;
}

export function permissionsForAccessLevel(level: string): PermissionId[] {
  const key = level as RoleId;
  return roleConfig[key]?.permissions ?? roleConfig.employee.permissions;
}

export function accessLevelLabel(level: string): string {
  const key = level as RoleId;
  return roleConfig[key]?.label ?? level;
}

export function normalizeRolePermissions(
  roleKey: string,
  stored: unknown,
): PermissionId[] {
  if (Array.isArray(stored) && stored.every((p) => typeof p === "string")) {
    return stored as PermissionId[];
  }
  return permissionsForAccessLevel(roleKey);
}

export function mapRoleRow(row: Record<string, unknown>) {
  const roleKey = String(row.role_key ?? "");
  const permissions = normalizeRolePermissions(roleKey, row.permissions);
  return {
    ...row,
    permissions,
    access_level: roleKey,
    access_level_label: accessLevelLabel(roleKey),
    is_builtin: isBuiltInCompanyRole({ is_default: row.is_default as boolean, role_key: roleKey }),
  };
}
