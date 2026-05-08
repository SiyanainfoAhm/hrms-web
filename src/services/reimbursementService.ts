/**
 * Thin client-side wrapper around the existing reimbursement APIs:
 *   - GET   /api/reimbursements
 *   - POST  /api/reimbursements
 *   - PATCH /api/reimbursements/[id]   (approver-only)
 *   - POST  /api/reimbursements/upload (signed file upload)
 *
 * Validation (amount, date, attachment-required, approver-only auto-approve,
 * payroll period derivation) is enforced server-side. Any caller — the
 * Approvals form OR the HRMS chatbot — must go through these wrappers so
 * nobody can submit a claim that bypasses required attachment / approver
 * rules.
 */

export type ReimbursementClaim = {
  id: string;
  employee_user_id: string | null;
  category: string;
  amount: number | string;
  currency: string | null;
  claim_date: string;
  description: string | null;
  attachment_url: string | null;
  status: string;
  payroll_year: number | null;
  payroll_month: number | null;
  rejection_reason: string | null;
  created_at: string;
  employeeName?: string | null;
  employeeEmail?: string | null;
};

export type CreateReimbursementInput = {
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  attachmentUrl: string;
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

export async function getReimbursements(): Promise<ReimbursementClaim[]> {
  const res = await fetch("/api/reimbursements");
  const data = await jsonOrThrow<{ claims?: ReimbursementClaim[] }>(res, "Failed to load reimbursements");
  return Array.isArray(data.claims) ? data.claims : [];
}

export async function getPendingReimbursements(): Promise<ReimbursementClaim[]> {
  const all = await getReimbursements();
  return all.filter((c) => c.status === "pending");
}

export async function uploadReimbursementAttachment(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/reimbursements/upload", { method: "POST", body: fd });
  const data = await jsonOrThrow<{ url?: string }>(res, "Failed to upload attachment");
  if (!data.url) throw new Error("Upload succeeded but no URL was returned");
  return data.url;
}

export async function createReimbursementRequest(input: CreateReimbursementInput): Promise<{ id: string; status: string }> {
  const res = await fetch("/api/reimbursements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<{ id: string; status: string }>(res, "Failed to create reimbursement");
}

export async function approveReimbursement(id: string): Promise<void> {
  const res = await fetch(`/api/reimbursements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
  await jsonOrThrow<unknown>(res, "Failed to approve reimbursement");
}

export async function rejectReimbursement(id: string, rejectionReason?: string): Promise<void> {
  const res = await fetch(`/api/reimbursements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", rejectionReason: rejectionReason ?? "Rejected" }),
  });
  await jsonOrThrow<unknown>(res, "Failed to reject reimbursement");
}
