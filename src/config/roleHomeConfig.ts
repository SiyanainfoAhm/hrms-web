import type { RoleId } from "./roleConfig";

/**
 * Default landing route after login, per HRMS role.
 */
export const roleHomeHref: Record<RoleId, string> = {
  super_admin: "/app/dashboard",
  admin: "/app/dashboard",
  hr: "/app/dashboard",
  manager: "/app/dashboard",
  employee: "/app/dashboard"
};

export function getRoleHomeHref(role: RoleId | undefined | null): string {
  if (!role) return roleHomeHref.employee;
  return roleHomeHref[role] ?? roleHomeHref.employee;
}
