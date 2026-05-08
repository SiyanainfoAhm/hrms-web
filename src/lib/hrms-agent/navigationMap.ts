import type { RoleId } from "@/config/roleConfig";
import { sidebarConfig } from "@/config/sidebarConfig";
import { roleConfig } from "@/config/roleConfig";

/**
 * Map of natural-language navigation keywords → existing app routes.
 * Routes are taken straight from sidebarConfig + the few known module
 * paths; we never invent a path. If a user asks for a screen that
 * isn't in the list, the chatbot tells them so.
 */
export type NavTarget = {
  /** Stable keyword the chatbot matches against ("dashboard", "payroll"…). */
  key: string;
  /** Human-readable label shown in chat ("Dashboard", "Payroll"…). */
  label: string;
  href: string;
  /** Optional extra synonyms the intent router can match on. */
  aliases?: string[];
  /** Roles that should see this entry as a navigation suggestion. */
  allowedRoles?: RoleId[];
};

function rolesWithPermission(perm: string): RoleId[] {
  const out: RoleId[] = [];
  for (const r of Object.values(roleConfig)) {
    if (r.permissions.includes(perm as never)) out.push(r.id);
  }
  return out;
}

/** Build the target list once at module load from sidebar + known routes. */
function buildTargets(): NavTarget[] {
  const fromSidebar: NavTarget[] = sidebarConfig.flatMap((section) =>
    section.items.map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href,
      allowedRoles: item.requiresAnyPermission?.flatMap((p) => rolesWithPermission(p)),
    })),
  );

  /** A few extra aliases / sub-routes that exist in the app but aren't
   * top-level sidebar items. Verified against the file tree under
   * src/app/app/**. */
  const extras: NavTarget[] = [
    { key: "leave", label: "Leave", href: "/app/approvals?tab=leave", aliases: ["leaves", "leave requests"] },
    {
      key: "reimbursement",
      label: "Reimbursements",
      href: "/app/approvals?tab=reimbursement",
      aliases: ["reimbursements", "expenses", "claim", "claims"],
    },
    { key: "payslip", label: "My Payslips", href: "/app/profile?tab=pay", aliases: ["payslips", "salary slip"] },
    {
      key: "documents",
      label: "My Documents",
      href: "/app/profile?tab=documents",
      aliases: ["my documents"],
    },
    { key: "company-settings", label: "Settings", href: "/app/settings", aliases: ["company settings", "company"] },
  ];

  /** De-dupe by key, preferring the sidebar entry when both present. */
  const map = new Map<string, NavTarget>();
  for (const t of [...fromSidebar, ...extras]) {
    if (!map.has(t.key)) map.set(t.key, t);
  }
  return [...map.values()];
}

export const navTargets: NavTarget[] = buildTargets();

export function findNavTarget(query: string): NavTarget | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const t of navTargets) {
    if (t.key.toLowerCase() === q) return t;
    if (t.label.toLowerCase() === q) return t;
    if ((t.aliases ?? []).some((a) => a.toLowerCase() === q)) return t;
  }
  for (const t of navTargets) {
    if (t.label.toLowerCase().includes(q) || (t.aliases ?? []).some((a) => a.toLowerCase().includes(q))) {
      return t;
    }
  }
  return null;
}

export function navTargetsForRole(role: RoleId | null | undefined): NavTarget[] {
  if (!role) return [];
  return navTargets.filter((t) => !t.allowedRoles || t.allowedRoles.includes(role));
}
