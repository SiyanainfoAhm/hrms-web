/**
 * Thin client-side wrapper around the existing leave APIs:
 *   - GET    /api/leave/requests
 *   - POST   /api/leave/requests
 *   - PATCH  /api/leave/requests   (approver-only)
 *   - GET    /api/leave/balance
 *   - GET    /api/leave/types
 *
 * Permissions, half-day rules, paid/unpaid splitting, and approver
 * gating are all enforced server-side in those routes. The chatbot
 * and the Approvals form share these helpers so neither bypasses
 * the existing business logic.
 */

export type LeaveTypeRow = {
  id: string;
  name: string;
  code?: string | null;
  is_paid?: boolean | null;
};

export type LeaveRequestRow = {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  employeeUserId: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  startDate: string;
  endDate: string;
  totalDays: number | string;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type LeaveBalanceRow = {
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  used: number;
  remaining: number | null;
};

export type CreateLeaveRequestInput = {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  isHalfDay?: boolean;
  /** Approver-only: when filing on behalf of another employee. */
  employeeUserId?: string;
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

export async function getLeaveTypes(): Promise<LeaveTypeRow[]> {
  const res = await fetch("/api/leave/types");
  const data = await jsonOrThrow<{ types?: LeaveTypeRow[] }>(res, "Failed to load leave types");
  return Array.isArray(data.types) ? data.types : [];
}

export async function getLeaveBalance(): Promise<LeaveBalanceRow[]> {
  const res = await fetch("/api/leave/balance");
  const data = await jsonOrThrow<{ balances?: LeaveBalanceRow[] }>(res, "Failed to load leave balance");
  return Array.isArray(data.balances) ? data.balances : [];
}

/** Same as the leave dialog: filter by type and entitlement as-of start date (optional). */
export async function getLeaveBalancePreview(
  leaveTypeId: string,
  asOfYmd?: string,
  employeeUserId?: string,
): Promise<LeaveBalanceRow[]> {
  const params = new URLSearchParams();
  if (leaveTypeId) params.set("leaveTypeId", leaveTypeId);
  if (asOfYmd) params.set("asOf", asOfYmd);
  if (employeeUserId) params.set("userId", employeeUserId);
  const q = params.toString();
  const res = await fetch(q ? `/api/leave/balance?${q}` : "/api/leave/balance");
  const data = await jsonOrThrow<{ balances?: LeaveBalanceRow[] }>(res, "Failed to load leave balance");
  return Array.isArray(data.balances) ? data.balances : [];
}

export async function getMyLeaveRequests(): Promise<LeaveRequestRow[]> {
  const res = await fetch("/api/leave/requests");
  const data = await jsonOrThrow<{ requests?: LeaveRequestRow[] }>(res, "Failed to load leave requests");
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function getPendingLeaveRequests(): Promise<LeaveRequestRow[]> {
  const all = await getMyLeaveRequests();
  return all.filter((r) => r.status === "pending");
}

export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequestRow> {
  const res = await fetch("/api/leave/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ request: LeaveRequestRow }>(res, "Failed to create leave request");
  return data.request;
}

export async function approveLeaveRequest(id: string): Promise<void> {
  const res = await fetch("/api/leave/requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "approve" }),
  });
  await jsonOrThrow<unknown>(res, "Failed to approve leave");
}

export async function rejectLeaveRequest(id: string, rejectionReason?: string): Promise<void> {
  const res = await fetch("/api/leave/requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action: "reject", rejectionReason: rejectionReason ?? "Rejected" }),
  });
  await jsonOrThrow<unknown>(res, "Failed to reject leave");
}
