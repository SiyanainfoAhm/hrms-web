import { hrmsJson } from "../../lib/hrmsJson";
import type { EmployeeDetail, EmployeeListRow, EmploymentStatusTab } from "./types";

export async function fetchEmployeesPage(params: {
  page: number;
  pageSize: number;
  employmentStatus: EmploymentStatusTab;
}): Promise<{ employees: EmployeeListRow[]; total: number; page: number; pageSize: number }> {
  const sp = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    employmentStatus: params.employmentStatus
  });
  return hrmsJson(`/api/employees?${sp.toString()}`);
}

export async function fetchEmployeeDetail(userId: string): Promise<{ employee: EmployeeDetail }> {
  return hrmsJson(`/api/employees?userId=${encodeURIComponent(userId)}`);
}

export async function createEmployee(body: Record<string, unknown>): Promise<{
  employee: EmployeeListRow;
  inviteUrl?: string | null;
  inviteEmailSent?: boolean | null;
  inviteEmailError?: string | null;
}> {
  return hrmsJson("/api/employees", { method: "POST", json: body });
}

export async function updateEmployee(body: Record<string, unknown>): Promise<{ employee: EmployeeListRow }> {
  return hrmsJson("/api/employees", { method: "PUT", json: body });
}

export async function patchEmployee(body: Record<string, unknown>): Promise<{ ok?: boolean; status?: string }> {
  return hrmsJson("/api/employees", { method: "PATCH", json: body });
}

export async function deleteEmployee(userId: string): Promise<{ ok: boolean }> {
  return hrmsJson(`/api/employees?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function fetchOnboardingBundle(employeeId: string): Promise<unknown> {
  return hrmsJson(`/api/employees/${encodeURIComponent(employeeId)}/onboarding`);
}

export async function fetchEmployeeDocuments(userId: string): Promise<{
  employee: { id: string; name: string | null; email: string };
  documents: { id: string; name: string; kind: string; is_mandatory: boolean }[];
  submissions: {
    id: string;
    document_id: string;
    status: string;
    file_url: string | null;
    signature_name: string | null;
    signed_at: string | null;
    submitted_at: string | null;
    review_note: string | null;
  }[];
}> {
  return hrmsJson(`/api/employees/${encodeURIComponent(userId)}/documents`);
}

export async function submitEmployeeDocument(args: {
  userId: string;
  documentId: string;
  fileUrl?: string;
  signatureName?: string;
}): Promise<{ submission: unknown }> {
  return hrmsJson(`/api/employees/${encodeURIComponent(args.userId)}/documents`, {
    method: "POST",
    json: {
      action: "submit_document",
      documentId: args.documentId,
      fileUrl: args.fileUrl,
      signatureName: args.signatureName,
    },
  });
}

export async function updateEmployeeDocumentSubmission(args: {
  userId: string;
  submissionId: string;
  status?: string;
  reviewNote?: string;
}): Promise<{ ok: boolean }> {
  return hrmsJson(`/api/employees/${encodeURIComponent(args.userId)}/documents`, {
    method: "PATCH",
    json: { action: "update_submission", submissionId: args.submissionId, status: args.status, reviewNote: args.reviewNote },
  });
}

export async function deleteEmployeeDocumentSubmission(args: {
  userId: string;
  submissionId: string;
}): Promise<{ ok: boolean }> {
  return hrmsJson(
    `/api/employees/${encodeURIComponent(args.userId)}/documents?submissionId=${encodeURIComponent(args.submissionId)}`,
    { method: "DELETE" },
  );
}

export async function fetchCompanyDocuments(): Promise<{ documents: { id: string; name: string; is_mandatory: boolean; kind: string }[] }> {
  return hrmsJson("/api/company/documents");
}

export async function fetchCompanyMe(): Promise<{ company: { professional_tax_monthly?: number | null } | null }> {
  return hrmsJson("/api/company/me");
}

export async function fetchDesignations(): Promise<{ designations: { id: string; title: string; is_active?: boolean }[] }> {
  return hrmsJson("/api/settings/designations");
}

export async function fetchDepartments(): Promise<{ departments: { id: string; name: string; division_id?: string; is_active?: boolean }[] }> {
  return hrmsJson("/api/settings/departments");
}

export async function fetchDivisions(): Promise<{ divisions: { id: string; name: string; is_active?: boolean }[] }> {
  return hrmsJson("/api/settings/divisions");
}

export async function fetchShifts(): Promise<{ shifts: { id: string; name: string; is_active?: boolean }[] }> {
  return hrmsJson("/api/settings/shifts");
}
