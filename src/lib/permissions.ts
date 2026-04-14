import type { PermissionId, RoleId } from "../config/roleConfig";
import { roleConfig } from "../config/roleConfig";

export type Actor = {
  role?: RoleId;
  permissions?: PermissionId[];
};

export function getRolePermissions(role?: RoleId): PermissionId[] {
  if (!role) return [];
  return roleConfig[role]?.permissions ?? [];
}

export function hasPermission(actor: Actor | null | undefined, perm: PermissionId): boolean {
  if (!actor) return false;
  const direct = actor.permissions ?? [];
  const rolePerms = getRolePermissions(actor.role);
  return [...direct, ...rolePerms].includes(perm);
}

export function hasAnyPermission(
  actor: Actor | null | undefined,
  perms: PermissionId[] | undefined
): boolean {
  if (!perms || perms.length === 0) return true;
  return perms.some((p) => hasPermission(actor, p));
}

export function hasAnyRole(actor: Actor | null | undefined, roles: RoleId[] | undefined): boolean {
  if (!roles || roles.length === 0) return true;
  const r = actor?.role;
  if (!r) return false;
  return roles.includes(r);
}

