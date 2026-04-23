"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  createEmployeeInvite,
  deleteEmployeeDocumentSubmission,
  fetchEmployeeDocuments,
  submitEmployeeDocument,
  updateEmployeeDocumentSubmission,
} from "./employeeDirectoryService";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Eye, Mail, PlusCircle } from "lucide-react";

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

function fileUrlsFromSubmissionFileUrl(raw: string | null | undefined): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()) : [];
    } catch {
      return [s];
    }
  }
  return [s];
}

function needsTwoSides(docName: string): boolean {
  const n = String(docName || "").toLowerCase();
  return n.includes("aadhaar") || n.includes("aadhar") || n.includes("pan");
}

function extractStoragePathFromPublicUrl(bucket: string, publicUrl: string): string | null {
  const s = String(publicUrl || "");
  if (!s) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = s.indexOf(marker);
  if (idx !== -1) return s.slice(idx + marker.length);
  const alt = `/${bucket}/`;
  const idx2 = s.indexOf(alt);
  if (idx2 !== -1) return s.slice(idx2 + alt.length);
  return null;
}

export function EmployeeDocumentsDialog(props: {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onToast: (kind: "success" | "error", msg: string) => void;
  /** Opens company-wide document settings so HR can add new document types for invites. */
  onOpenCompanyDocs?: () => void;
}) {
  const { open, userId, onClose, onToast, onOpenCompanyDocs } = props;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [employee, setEmployee] = useState<{ id: string; name: string | null; email: string } | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sub | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  /** Document IDs to include on the next invite (employee uploads via /invite/:token). */
  const [requestedDocIds, setRequestedDocIds] = useState<Set<string>>(new Set());
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);

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
    const uniq =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : `${Date.now()}_${Math.random()}`;
    const path = `HRMS/${employeeFolder}/${category}/${docFolder}/${uniq}_${safeFile}`;
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
    setRequestedDocIds(new Set((data.documents ?? []).map((d) => d.id)));
  }

  function inviteUrlFromToken(token: string) {
    try {
      return `${window.location.origin}/invite/${token}`;
    } catch {
      return `/invite/${token}`;
    }
  }

  async function issueInvite(sendEmail: boolean): Promise<string | null> {
    if (!userId || !employee?.email?.trim()) {
      onToast("error", "Employee email is required to send an invite.");
      return null;
    }
    const ids = Array.from(requestedDocIds);
    if (ids.length === 0) {
      onToast("error", "Select at least one document to request.");
      return null;
    }
    setInviteBusy(true);
    try {
      const res = await createEmployeeInvite({
        email: employee.email.trim().toLowerCase(),
        userId,
        requestedDocumentIds: ids,
        sendEmail,
      });
      const token = (res as { invite?: { token?: string } })?.invite?.token ?? null;
      if (token) setLastInviteToken(token);
      if (sendEmail) {
        if (res.emailSent) {
          onToast("success", "Invite email sent.");
          onClose();
        } else {
          onToast("error", res.emailError || "Invite created but email could not be sent.");
        }
      } else {
        onToast("success", "Invite link ready.");
      }
      return token;
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "Failed to create invite");
      return null;
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInviteLink() {
    let token = lastInviteToken;
    if (!token) token = await issueInvite(false);
    if (!token) return;
    try {
      await navigator.clipboard.writeText(inviteUrlFromToken(token));
      onToast("success", "Invite link copied.");
    } catch {
      onToast("error", "Failed to copy.");
    }
  }

  useEffect(() => {
    if (!open || !userId) return;
    setLastInviteToken(null);
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
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={inviteBusy || loading || !userId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:brightness-95 disabled:opacity-50"
              title="Email the employee a link to upload documents (48h)"
              onClick={() => void issueInvite(true)}
            >
              <Mail className="w-4 h-4" />
              {inviteBusy ? "Sending…" : "Send invite email"}
            </button>
            <button
              type="button"
              disabled={inviteBusy || loading || !userId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              onClick={() => void copyInviteLink()}
            >
              Copy invite link
            </button>
            {lastInviteToken && (
              <a
                href={inviteUrlFromToken(lastInviteToken)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                Open invite
              </a>
            )}
            {onOpenCompanyDocs && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
                onClick={() => onOpenCompanyDocs()}
              >
                <PlusCircle className="w-4 h-4" />
                Add document
              </button>
            )}
            <button type="button" className="text-gray-500 hover:text-gray-800 text-sm font-medium" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {docs.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <div className="font-medium text-gray-900 mb-2">Include on invite (employee uploads these on the invite page)</div>
              <div className="flex flex-wrap gap-3">
                {docs.map((d) => (
                  <label key={d.id} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestedDocIds.has(d.id)}
                      onChange={(e) => {
                        setRequestedDocIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.id);
                          else next.delete(d.id);
                          return next;
                        });
                      }}
                    />
                    <span>{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
                            <div className="space-y-1">
                              {fileUrlsFromSubmissionFileUrl(s.file_url).map((u, idx, arr) => (
                                <div key={u + idx} className="flex items-center gap-2">
                                  <a
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[var(--primary)] underline font-medium"
                                  >
                                    Open file{arr.length > 1 ? ` ${idx + 1}` : ""}
                                  </a>
                                  <button
                                    type="button"
                                    disabled={canBusy || !userId}
                                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                                    onClick={async () => {
                                      if (!userId || !s) return;
                                      const current = fileUrlsFromSubmissionFileUrl(s.file_url);
                                      const remaining = current.filter((_, i) => i !== idx);
                                      try {
                                        setBusyDocId(d.id);
                                        // Best-effort remove the file from storage.
                                        const p = extractStoragePathFromPublicUrl(bucket, u);
                                        if (p) {
                                          try {
                                            await supabase.storage.from(bucket).remove([p]);
                                          } catch {
                                            // ignore
                                          }
                                        }
                                        await submitEmployeeDocument({
                                          userId,
                                          documentId: d.id,
                                          ...(remaining.length
                                            ? remaining.length > 1
                                              ? { fileUrls: remaining }
                                              : { fileUrl: remaining[0] }
                                            : { clear: true }),
                                        });
                                        await refresh();
                                        onToast("success", remaining.length ? "File removed." : "Document cleared.");
                                      } catch (e2) {
                                        onToast("error", e2 instanceof Error ? e2.message : "Failed to remove file");
                                      } finally {
                                        setBusyDocId(null);
                                      }
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
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
                              multiple
                              accept="image/*,.pdf"
                              disabled={canBusy || !userId}
                              className="block w-[220px] text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 disabled:opacity-50"
                              onChange={async (e) => {
                                const files = Array.from(e.target.files ?? []).filter(Boolean);
                                if (!files.length || !userId) return;
                                try {
                                  setBusyDocId(d.id);
                                  const picked = files.slice(0, 3);
                                  const urls: string[] = [];
                                  for (const f of picked) {
                                    const u = await uploadToStorage(d.name, "upload", f, f.name);
                                    urls.push(u);
                                  }
                                  // Best-effort remove previously stored files that aren't in the new set.
                                  const prev = s?.file_url ? fileUrlsFromSubmissionFileUrl(s.file_url) : [];
                                  const toDelete = prev
                                    .filter((pu) => !urls.includes(pu))
                                    .map((pu) => extractStoragePathFromPublicUrl(bucket, pu))
                                    .filter((p): p is string => Boolean(p));
                                  if (toDelete.length) {
                                    try {
                                      await supabase.storage.from(bucket).remove(toDelete);
                                    } catch {
                                      // ignore
                                    }
                                  }
                                  await submitEmployeeDocument({
                                    userId,
                                    documentId: d.id,
                                    ...(urls.length > 1 ? { fileUrls: urls } : { fileUrl: urls[0] }),
                                  });
                                  await refresh();
                                  onToast("success", "Document updated.");
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

