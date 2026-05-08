"use client";

import type { RoleId } from "@/config/roleConfig";
import type { HrmsAgentIntent } from "@/lib/hrms-agent/types";
import { isApproverRole, isSuperAdminRole } from "@/lib/hrms-agent/permissions";

type QuickAction = {
  label: string;
  intent: HrmsAgentIntent;
  slots?: Record<string, unknown>;
};

const employeeActions: QuickAction[] = [
  { label: "Punch In", intent: "punch_in" },
  { label: "Start Lunch", intent: "lunch_out" },
  { label: "End Lunch", intent: "lunch_in" },
  { label: "Punch Out", intent: "punch_out" },
  { label: "Apply Leave", intent: "leave_request" },
  { label: "Reimbursement", intent: "reimbursement_request" },
  { label: "Today Status", intent: "attendance_status" },
];

const approverActions: QuickAction[] = [
  { label: "Pending Leaves", intent: "pending_leaves" },
  { label: "Pending Reimbursements", intent: "pending_reimbursements" },
  { label: "Search Employee", intent: "search_employee", slots: { _prompt: "Type a name, email, or code" } },
  { label: "Attendance Today", intent: "navigate", slots: { targetKey: "attendance" } },
  { label: "Payroll", intent: "navigate", slots: { targetKey: "payroll" } },
];

const superAdminActions: QuickAction[] = [
  { label: "Dashboard", intent: "navigate", slots: { targetKey: "dashboard" } },
  { label: "Employees", intent: "navigate", slots: { targetKey: "employees" } },
  { label: "Attendance", intent: "navigate", slots: { targetKey: "attendance" } },
  { label: "Payroll", intent: "navigate", slots: { targetKey: "payroll" } },
  { label: "Settings", intent: "navigate", slots: { targetKey: "settings" } },
];

function actionSignature(a: QuickAction): string {
  const slotKey = a.slots
    ? Object.keys(a.slots)
        .sort()
        .map((k) => `${k}=${String((a.slots as Record<string, unknown>)[k])}`)
        .join("|")
    : "";
  return `${a.intent}::${a.label}::${slotKey}`;
}

export function getQuickActionsForRole(role: RoleId | null | undefined): QuickAction[] {
  const merged: QuickAction[] = [...employeeActions];
  if (isApproverRole(role)) merged.push(...approverActions);
  if (isSuperAdminRole(role)) merged.push(...superAdminActions);
  const seen = new Set<string>();
  const unique: QuickAction[] = [];
  for (const a of merged) {
    const sig = actionSignature(a);
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(a);
  }
  return unique;
}

export function HrmsAgentQuickActions({
  role,
  disabled,
  onPick,
}: {
  role: RoleId | null | undefined;
  disabled?: boolean;
  onPick: (action: QuickAction) => void;
}) {
  const actions = getQuickActionsForRole(role);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50/70 px-3 py-2">
      {actions.map((a, i) => (
        <button
          key={`${a.intent}-${a.label}-${i}`}
          type="button"
          disabled={disabled}
          onClick={() => onPick(a)}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
