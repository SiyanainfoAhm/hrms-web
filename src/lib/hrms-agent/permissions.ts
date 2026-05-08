import type { RoleId } from "@/config/roleConfig";
import type { HrmsAgentIntent } from "./types";

const APPROVERS: RoleId[] = ["super_admin", "admin", "hr"];

export function isApproverRole(role: RoleId | null | undefined): boolean {
  return !!role && APPROVERS.includes(role);
}

export function isSuperAdminRole(role: RoleId | null | undefined): boolean {
  return role === "super_admin";
}

/**
 * Single source of truth for which roles can fire which chatbot intent.
 * The corresponding API routes do their own role enforcement on the
 * server (e.g. /api/leave/requests PATCH rejects non-approvers); this
 * map is purely UX so we don't show actions the user can't perform.
 */
const intentRoles: Record<HrmsAgentIntent, RoleId[]> = {
  punch_in: ["super_admin", "admin", "hr", "manager", "employee"],
  punch_out: ["super_admin", "admin", "hr", "manager", "employee"],
  lunch_in: ["super_admin", "admin", "hr", "manager", "employee"],
  lunch_out: ["super_admin", "admin", "hr", "manager", "employee"],
  attendance_status: ["super_admin", "admin", "hr", "manager", "employee"],

  leave_request: ["super_admin", "admin", "hr", "manager", "employee"],
  leave_balance: ["super_admin", "admin", "hr", "manager", "employee"],
  reimbursement_request: ["super_admin", "admin", "hr", "manager", "employee"],
  payslip_summary: ["super_admin", "admin", "hr", "manager", "employee"],

  pending_leaves: APPROVERS,
  approve_leave: APPROVERS,
  reject_leave: APPROVERS,

  pending_reimbursements: APPROVERS,
  approve_reimbursement: APPROVERS,
  reject_reimbursement: APPROVERS,

  search_employee: APPROVERS,

  navigate: ["super_admin", "admin", "hr", "manager", "employee"],
  help: ["super_admin", "admin", "hr", "manager", "employee"],
  fallback: ["super_admin", "admin", "hr", "manager", "employee"],
};

export function canRunIntent(role: RoleId | null | undefined, intent: HrmsAgentIntent): boolean {
  if (!role) return false;
  const allowed = intentRoles[intent];
  return Array.isArray(allowed) && allowed.includes(role);
}
