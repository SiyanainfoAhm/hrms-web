import type { Actor } from "./permissions";
import { hasAnyPermission, hasAnyRole } from "./permissions";
import type { VisibilityRule } from "../types/crud";

export function isVisible(actor: Actor | null | undefined, rule: VisibilityRule | undefined): boolean {
  if (!rule) return true;
  return hasAnyRole(actor, rule.anyRole) && hasAnyPermission(actor, rule.anyPermission);
}

