"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  deleteEmployeeDocumentSubmission,
  fetchEmployeeDocuments,
  submitEmployeeDocument,
  updateEmployeeDocumentSubmission,
} from "./employeeDirectoryService";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

type Doc = { id: string; name: string; kind: string; is_mandatory: boolean };
type Sub = {
  id: string;
  document_id: string;
  status: string;
  file_url: string | null;
  signature_name: string | null;
  signed_at: string | null;
  submitted_at: string | null;
  review_note: string | null;
};

export function EmployeeDocumentsDialog(props: {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onToast: (kind: "success" | "error", msg: string) => void;
}) {
  const { open, userId, onClose, onToast } = props;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [employee, setEmployee] = useState<{ id: string; name: string | null; email: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sub | null>(null);
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

  async function refresh() {
    if (!userId) return;
    const data = await fetchEmployeeDocuments(userId);
    setEmployee(data.employee);
    setDocs(data.documents ?? []);
    setSubs(data.submissions ?? []);
  }

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const subByDocId = useMemo(() => {
    const m = new Map<string, Sub>();
    for (const s of subs) m.set(String(s.document_id), s);
    return m;
  }, [subs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">Employee documents</h2>
            <p className="text-xs text-gray-500 truncate">
              {employee ? `${employee.name || "Employee"} · ${employee.email}` : "—"}
            </p>
          </div>
          <button type="button" className="text-gray-500 hover:text-gray-800 text-sm font-medium" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {err && <div className="rounded-lg bg-red-50 text-red-800 text-sm px-3 py-2 border border-red-100">{err}</div>}
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-gray-500">No company documents configured.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-2 pr-4 font-medium">Document</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">File / signature</th>
                    <th className="py-2 pr-4 font-medium">Update</th>
                    <th className="py-2 pr-0 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => {
                    const s = subByDocId.get(d.id) || null;
                    const kindLabel = d.kind === "digital_signature" ? "E-sign" : "Upload";
                    const canBusy = busyDocId === d.id;
                    return (
                      <tr key={d.id} className="border-b border-gray-50">
                        <td className="py-2 pr-4 align-top">
                          <div className="font-medium text-gray-900">{d.name}</div>
                          {d.is_mandatory && <div className="text-[10px] uppercase text-amber-700 mt-0.5">Mandatory</div>}
                        </td>
                        <td className="py-2 pr-4 align-top text-gray-700">{kindLabel}</td>
                        <td className="py-2 pr-4 align-top">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-800">{s?.status || "pending"}</span>
                            {s?.id && (
                              <select
                                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                                value={s.status || "pending"}
                                disabled={canBusy}
                                onChange={async (e) => {
                                  if (!userId || !s) return;
                                  try {
                                    setBusyDocId(d.id);
                                    await updateEmployeeDocumentSubmission({
                                      userId,
                                      submissionId: s.id,
                                      status: e.target.value,
                                    });
                                    await refresh();
                                    onToast("success", "Status updated.");
                                  } catch (e2) {
                                    onToast("error", e2 instanceof Error ? e2.message : "Failed to update status");
                                  } finally {
                                    setBusyDocId(null);
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
                                defaultValue={s.review_note || ""}
                                disabled={canBusy}
                                onBlur={async (e) => {
                                  if (!userId || !s) return;
                                  const val = e.target.value;
                                  try {
                                    setBusyDocId(d.id);
                                    await updateEmployeeDocumentSubmission({
                                      userId,
                                      submissionId: s.id,
                                      reviewNote: val,
                                    });
                                    await refresh();
                                  } catch {
                                    // keep silent; avoid annoying toasts on blur
                                  } finally {
                                    setBusyDocId(null);
                                  }
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          {s?.file_url ? (
                            <a
                              href={s.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--primary)] underline font-medium"
                            >
                              Open file
                            </a>
                          ) : s?.signature_name ? (
                            <span className="text-gray-700">Signed as {s.signature_name}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          {d.kind === "upload" ? (
                            <input
                              type="file"
                              disabled={canBusy || !userId}
                              className="block w-[220px] text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 disabled:opacity-50"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !userId) return;
                                try {
                                  setBusyDocId(d.id);
                                  const publicUrl = await uploadToStorage(d.name, "upload", file, file.name);
                                  await submitEmployeeDocument({ userId, documentId: d.id, fileUrl: publicUrl });
                                  await refresh();
                                  onToast("success", "Document uploaded.");
                                } catch (e2) {
                                  onToast("error", e2 instanceof Error ? e2.message : "Upload failed");
                                } finally {
                                  setBusyDocId(null);
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
                                  setBusyDocId(d.id);
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
                                  await refresh();
                                  (e.currentTarget as HTMLFormElement).reset();
                                  onToast("success", "Document signed.");
                                } catch (e2) {
                                  onToast("error", e2 instanceof Error ? e2.message : "Sign failed");
                                } finally {
                                  setBusyDocId(null);
                                }
                              }}
                            >
                              <input
                                name="signatureName"
                                placeholder="Employee name"
                                disabled={canBusy || !userId}
                                className="w-[160px] rounded-md border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-50"
                              />
                              <button
                                type="submit"
                                disabled={canBusy || !userId}
                                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm disabled:opacity-50"
                              >
                                {canBusy ? "Signing…" : "Sign"}
                              </button>
                            </form>
                          )}
                        </td>
                        <td className="py-2 pr-0 align-top text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={!s?.id || canBusy}
                              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm disabled:opacity-50"
                              onClick={() => s?.id && setDeleteTarget(s)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete document submission?"
          description="This will remove the employee's submission record for this document."
          confirmText="Delete"
          danger
          loading={deleteLoading}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!userId || !deleteTarget) return;
            setDeleteLoading(true);
            try {
              await deleteEmployeeDocumentSubmission({ userId, submissionId: deleteTarget.id });
              await refresh();
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
    </div>
  );
}

