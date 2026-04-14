"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  deleteEmployeeDocumentSubmission,
  fetchOnboardingBundle,
  submitEmployeeDocument,
  updateEmployeeDocumentSubmission,
} from "./employeeDirectoryService";

type InviteRow = {
  id: string;
  status: string;
  email?: string | null;
  token?: string | null;
  expires_at?: string | null;
  completed_at?: string | null;
};

type CompanyDocRow = {
  id: string;
  name: string;
  kind: "upload" | "digital_signature" | string;
  is_mandatory?: boolean;
};

type SubmissionRow = {
  id: string;
  document_id: string;
  status: string;
  file_url: string | null;
  signature_name: string | null;
  review_note?: string | null;
};

const DONE_DOC_STATUSES = new Set(["submitted", "signed", "approved"]);

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function PreboardingDetailsDialog(props: {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onToast: (kind: "success" | "error", msg: string) => void;
}) {
  const { open, userId, onClose, onToast } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [docBusyId, setDocBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ submissionId: string; docName: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";

  function sanitizeSegment(s: string): string {
    return (s || "")
      .trim()
      .replace(/[\/\\]+/g, "-")
      .replace(/[^\w\s.\-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s/g, "_")
      .slice(0, 64);
  }

  async function uploadToStorage(docName: string, kind: "upload" | "digital_signature", file: Blob, fileNameHint: string) {
    const empName = sanitizeSegment(employee?.name || employee?.email || "Employee");
    const employeeFolder = `${empName}${userId || ""}`;
    const category = kind === "digital_signature" ? "esign" : "upload";
    const docFolder = sanitizeSegment(docName) || "Document";
    const safeFile = sanitizeSegment(fileNameHint) || "file";
    const path = `HRMS/${employeeFolder}/${category}/${docFolder}/${Date.now()}_${safeFile}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Failed to get public URL");
    return data.publicUrl;
  }

  async function refreshBundle() {
    if (!userId) return;
    const data = await fetchOnboardingBundle(userId);
    setBundle(data);
  }

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOnboardingBundle(userId);
        if (cancelled) return;
        setBundle(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const invite: InviteRow | null = bundle?.invite ?? null;
  const employee: any = bundle?.employee ?? null;
  const documents: CompanyDocRow[] = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const submissions: SubmissionRow[] = useMemo(
    () => (Array.isArray(bundle?.submissions) ? bundle.submissions : []),
    [bundle?.submissions]
  );

  const inviteUrl = useMemo(() => {
    const token = invite?.token;
    if (!token) return null;
    try {
      return `${window.location.origin}/invite/${token}`;
    } catch {
      return null;
    }
  }, [invite?.token]);

  const subByDocId = useMemo(() => {
    const m = new Map<string, SubmissionRow>();
    for (const s of submissions) {
      if (s?.document_id) m.set(String(s.document_id), s);
    }
    return m;
  }, [submissions]);

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      onToast("success", "Invite link copied.");
    } catch {
      onToast("error", "Failed to copy invite link.");
    }
  }

  async function sendInviteEmail() {
    if (!userId) return;
    setSendingInvite(true);
    try {
      const res = await fetch("/api/invites/hrms-send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send invite email");
      onToast("success", "Invite email sent.");
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "Failed to send invite email");
    } finally {
      setSendingInvite(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">Preboarding details</h2>
            <p className="text-xs text-gray-500 truncate">Employee info + submitted documents</p>
          </div>
          <button type="button" className="text-gray-500 hover:text-gray-800 text-sm font-medium" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 text-red-800 text-sm px-3 py-2 border border-red-100">{error}</div>
          )}
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Employee</div>
                  <div className="text-xs text-gray-700 space-y-1">
                    <div>
                      <span className="text-gray-500">Name:</span> {employee?.name ?? "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span> {employee?.email ?? "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span> {employee?.phone ?? "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">DOB:</span> {employee?.date_of_birth ? String(employee.date_of_birth).slice(0, 10) : "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">DOJ:</span> {employee?.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : "—"}
                    </div>
                    <div className="pt-1">
                      <span className="text-gray-500">Current address:</span>{" "}
                      {[employee?.current_address_line1, employee?.current_address_line2, employee?.current_city, employee?.current_state]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                    <div className="pt-1">
                      <span className="text-gray-500">Bank:</span>{" "}
                      {employee?.bank_name ? `${employee.bank_name} (Acct ${employee.bank_account_number ? "provided" : "missing"})` : "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">TDS (monthly):</span> {employee?.tds_monthly ?? employee?.tds ?? 0}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Invite</div>
                  <div className="text-xs text-gray-700 space-y-1">
                    <div>
                      <span className="text-gray-500">Status:</span> {invite?.status ?? "—"}
                    </div>
                    <div>
                      <span className="text-gray-500">Expires:</span> {fmtDateTime(invite?.expires_at)}
                    </div>
                    <div>
                      <span className="text-gray-500">Completed:</span> {fmtDateTime(invite?.completed_at)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={sendingInvite || !userId}
                      className="px-3 py-2 rounded-lg bg-[var(--primary)] text-white font-semibold hover:brightness-95 transition text-sm disabled:opacity-50"
                      onClick={() => void sendInviteEmail()}
                    >
                      {sendingInvite ? "Sending…" : "Send invite email"}
                    </button>
                    <button
                      type="button"
                      disabled={!inviteUrl}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm disabled:opacity-50"
                      onClick={() => void copyInviteLink()}
                    >
                      Copy invite link
                    </button>
                    <a
                      href={inviteUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={`px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm ${!inviteUrl ? "pointer-events-none opacity-50" : ""}`}
                    >
                      Open invite page
                    </a>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    Documents are completed via the invite page (same flow as HRMS / edge-email invite).
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-900 mb-3">Documents</div>
                {documents.length === 0 ? (
                  <div className="text-sm text-gray-500">No documents configured for this invite.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="py-2 pr-4 font-medium">Name</th>
                          <th className="py-2 pr-4 font-medium">Type</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-0 font-medium">File / Signature</th>
                          <th className="py-2 pr-0 font-medium">Update</th>
                          <th className="py-2 pr-0 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((d) => {
                          const s = subByDocId.get(d.id) || null;
                          const status = s?.status || "pending";
                          const isDone = DONE_DOC_STATUSES.has(String(status));
                          return (
                            <tr
                              key={d.id}
                              className={isDone ? "border-b border-gray-50 bg-green-50/40" : "border-b border-gray-50"}
                            >
                              <td className="py-2 pr-4">{d.name}</td>
                              <td className="py-2 pr-4">{d.kind}</td>
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className={isDone ? "text-green-800 font-medium" : ""}>{status}</span>
                                  {s?.id && (
                                    <select
                                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                                      value={status}
                                      disabled={docBusyId === d.id}
                                      onChange={async (e) => {
                                        if (!userId || !s?.id) return;
                                        try {
                                          setDocBusyId(d.id);
                                          await updateEmployeeDocumentSubmission({
                                            userId,
                                            submissionId: s.id,
                                            status: e.target.value,
                                          });
                                          await refreshBundle();
                                          onToast("success", "Status updated.");
                                        } catch (e2) {
                                          onToast("error", e2 instanceof Error ? e2.message : "Failed to update status");
                                        } finally {
                                          setDocBusyId(null);
                                        }
                                      }}
                                    >
                                      <option value="pending">pending</option>
                                      <option value="submitted">submitted</option>
                                      <option value="signed">signed</option>
                                      <option value="approved">approved</option>
                                      <option value="rejected">rejected</option>
                                    </select>
                                  )}
                                </div>
                                {s?.id && (
                                  <div className="mt-1">
                                    <input
                                      placeholder="Review note (optional)"
                                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
                                      defaultValue={(s as any).review_note || ""}
                                      disabled={docBusyId === d.id}
                                      onBlur={async (e) => {
                                        if (!userId || !s?.id) return;
                                        const val = e.target.value;
                                        try {
                                          setDocBusyId(d.id);
                                          await updateEmployeeDocumentSubmission({
                                            userId,
                                            submissionId: s.id,
                                            reviewNote: val,
                                          });
                                          await refreshBundle();
                                        } catch {
                                          // keep silent on blur
                                        } finally {
                                          setDocBusyId(null);
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </td>
                              <td className="py-2 pr-0">
                                {s?.file_url ? (
                                  <a href={s.file_url} target="_blank" rel="noreferrer" className="text-[var(--primary)] underline font-medium">
                                    Open file
                                  </a>
                                ) : s?.signature_name ? (
                                  <span className="text-gray-700">Signed as {s.signature_name}</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="py-2 pr-0">
                                {d.kind === "upload" ? (
                                  <input
                                    type="file"
                                    disabled={!userId || docBusyId === d.id}
                                    className="block w-[220px] text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 disabled:opacity-50"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file || !userId) return;
                                      try {
                                        setDocBusyId(d.id);
                                        const publicUrl = await uploadToStorage(d.name, "upload", file, file.name);
                                        await submitEmployeeDocument({ userId, documentId: d.id, fileUrl: publicUrl });
                                        await refreshBundle();
                                        onToast("success", "Document uploaded.");
                                      } catch (e2) {
                                        onToast("error", e2 instanceof Error ? e2.message : "Upload failed");
                                      } finally {
                                        setDocBusyId(null);
                                        (e.target as HTMLInputElement).value = "";
                                      }
                                    }}
                                  />
                                ) : (
                                  <form
                                    className="flex items-center gap-2"
                                    onSubmit={async (e) => {
                                      e.preventDefault();
                                      if (!userId) return;
                                      const fd = new FormData(e.currentTarget);
                                      const signatureName = String(fd.get("signatureName") || "").trim();
                                      if (!signatureName) return;
                                      try {
                                        setDocBusyId(d.id);
                                        const receiptText = `Document: ${d.name}\nSigned by: ${signatureName}\nSigned at: ${new Date().toISOString()}\n`;
                                        const blob = new Blob([receiptText], { type: "text/plain" });
                                        let receiptUrl = "";
                                        try {
                                          receiptUrl = await uploadToStorage(d.name, "digital_signature", blob, `${d.name}_SIGNATURE_RECEIPT.txt`);
                                        } catch {
                                          receiptUrl = "";
                                        }
                                        await submitEmployeeDocument({
                                          userId,
                                          documentId: d.id,
                                          signatureName,
                                          fileUrl: receiptUrl || undefined,
                                        });
                                        await refreshBundle();
                                        (e.currentTarget as HTMLFormElement).reset();
                                        onToast("success", "Document signed.");
                                      } catch (e2) {
                                        onToast("error", e2 instanceof Error ? e2.message : "Sign failed");
                                      } finally {
                                        setDocBusyId(null);
                                      }
                                    }}
                                  >
                                    <input
                                      name="signatureName"
                                      placeholder="Employee name"
                                      disabled={!userId || docBusyId === d.id}
                                      className="w-[160px] rounded-md border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-50"
                                    />
                                    <button
                                      type="submit"
                                      disabled={!userId || docBusyId === d.id}
                                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm disabled:opacity-50"
                                    >
                                      {docBusyId === d.id ? "Signing…" : "Sign"}
                                    </button>
                                  </form>
                                )}
                              </td>
                              <td className="py-2 pr-0 text-right">
                                <button
                                  type="button"
                                  disabled={!userId || !s?.id || docBusyId === d.id}
                                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm disabled:opacity-50"
                                  onClick={() => s?.id && setDeleteTarget({ submissionId: s.id, docName: d.name })}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete document submission?"
        description={deleteTarget ? `This will remove the employee's submission for “${deleteTarget.docName}”.` : ""}
        confirmText="Delete"
        danger
        loading={deleteLoading}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!userId || !deleteTarget) return;
          setDeleteLoading(true);
          try {
            await deleteEmployeeDocumentSubmission({ userId, submissionId: deleteTarget.submissionId });
            await refreshBundle();
            onToast("success", "Submission deleted.");
            setDeleteTarget(null);
          } catch (e) {
            onToast("error", e instanceof Error ? e.message : "Delete failed");
          } finally {
            setDeleteLoading(false);
          }
        }}
      />
    </div>
  );
}

