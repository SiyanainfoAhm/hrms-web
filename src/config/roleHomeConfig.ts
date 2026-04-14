import type { RoleId } from "./roleConfig";

/**
 * Master-template convention: one place to decide where an authenticated user
 * should land, based on their role.
 *
 * For now all roles point to the demo dashboard. In a real app you can change
 * these to role-specific routes (e.g. "/app/admin", "/app/staff", etc).
 */
export const roleHomeHref: Record<RoleId, string> = {
  owner: "/app/demo",
  admin: "/app/demo",
  manager: "/app/demo",
  staff: "/app/demo",
  viewer: "/app/demo"
};

export function getRoleHomeHref(role: RoleId | undefined | null): string {
  if (!role) return roleHomeHref.viewer;
  return roleHomeHref[role] ?? roleHomeHref.viewer;
}

