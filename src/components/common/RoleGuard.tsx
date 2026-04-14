"use client";

import type { PermissionId, RoleId } from "../../config/roleConfig";
import type { Actor } from "../../lib/permissions";
import { hasAnyPermission, hasAnyRole } from "../../lib/permissions";

export function RoleGuard({
  actor,
  anyRole,
  anyPermission,
  fallback = null,
  children
}: {
  actor: Actor | null | undefined;
  anyRole?: RoleId[];
  anyPermission?: PermissionId[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ok = hasAnyRole(actor, anyRole) && hasAnyPermission(actor, anyPermission);
  return ok ? children : fallback;
}

