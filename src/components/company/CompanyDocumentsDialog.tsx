"use client";

import { FormEvent, useEffect, useState } from "react";
import { useToast } from "@/components/common/ToastProvider";

type DocKind = "upload" | "digital_signature";

export function CompanyDocumentsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);

  const [creatingDoc, setCreatingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocKind, setNewDocKind] = useState<DocKind>("upload");
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [newDocContent, setNewDocContent] = useState("");

  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [editDocName, setEditDocName] = useState("");
  const [editDocKind, setEditDocKind] = useState<DocKind>("upload");
  const [editDocMandatory, setEditDocMandatory] = useState(true);
  const [editDocContent, setEditDocContent] = useState("");

  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  async function loadDocuments() {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to load documents");
      setDocs((data as any)?.documents || []);
    } catch (e: any) {
      setDocsError(e?.message || "Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  }

  function startEditDoc(d: any) {
    setDocsError(null);
    setEditDocId(String(d.id));
    setEditDocName(String(d.name ?? ""));
    setEditDocKind((d.kind === "digital_signature" ? "digital_signature" : "upload") as any);
    setEditDocMandatory(Boolean(d.is_mandatory));
    setEditDocContent(String(d.content_text ?? ""));
  }

  function cancelEditDoc() {
    setEditDocId(null);
    setEditDocName("");
    setEditDocKind("upload");
    setEditDocMandatory(true);
    setEditDocContent("");
  }

  async function createDocument(e: FormEvent) {
    e.preventDefault();
    setCreatingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newDocName.trim(),
          kind: newDocKind,
          isMandatory: Boolean(newDocMandatory),
          contentText: newDocKind === "digital_signature" ? newDocContent : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to create document");
      setNewDocName("");
      setNewDocKind("upload");
      setNewDocMandatory(true);
      setNewDocContent("");
      await loadDocuments();
      showToast("success", "Document added");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to create document");
      showToast("error", e?.message || "Failed to create document");
    } finally {
      setCreatingDoc(false);
    }
  }

  async function saveEditedDoc() {
    if (!editDocId) return;
    setSavingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDocId,
          name: editDocName.trim(),
          kind: editDocKind,
          isMandatory: Boolean(editDocMandatory),
          contentText: editDocKind === "digital_signature" ? editDocContent : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to update document");
      cancelEditDoc();
      await loadDocuments();
      showToast("success", "Document updated");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to update document");
      showToast("error", e?.message || "Failed to update document");
    } finally {
      setSavingDoc(false);
    }
  }

  async function deleteCompanyDoc(id: string) {
    setDeletingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/company/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to delete document");
      setDeleteDocId(null);
      if (editDocId === id) cancelEditDoc();
      await loadDocuments();
      showToast("success", "Document deleted");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to delete document");
      showToast("error", e?.message || "Failed to delete document");
    } finally {
      setDeletingDoc(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadDocuments();
  }, [open]);

  function closeAndReset() {
    setDocsError(null);
    setDeleteDocId(null);
    cancelEditDoc();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={closeAndReset} />
      <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Company documents</h2>
            <p className="text-sm text-gray-600">Define onboarding documents (upload or digital signature).</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            onClick={closeAndReset}
          >
            Close
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-5 space-y-4">
          {docsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{docsError}</div>
          )}

          <form onSubmit={createDocument} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
            <label className="text-sm sm:col-span-1">
              <span className="text-gray-600">Document name</span>
              <input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Offer letter / ID proof / NDA"
                required
              />
            </label>
            <label className="text-sm sm:col-span-1">
              <span className="text-gray-600">Type</span>
              <select
                value={newDocKind}
                onChange={(e) => setNewDocKind(e.target.value as DocKind)}
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="upload">Upload</option>
                <option value="digital_signature">Digital signature</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-1 flex items-end gap-2">
              <input type="checkbox" checked={newDocMandatory} onChange={(e) => setNewDocMandatory(e.target.checked)} />
              <span className="text-gray-700 font-medium">Mandatory</span>
            </label>

            {newDocKind === "digital_signature" && (
              <label className="text-sm sm:col-span-3">
                <span className="text-gray-600">Signature content text</span>
                <textarea
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Paste the agreement text employees must sign."
                />
              </label>
            )}

            <div className="sm:col-span-3 flex justify-start">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition disabled:opacity-50"
                disabled={creatingDoc || !newDocName.trim()}
              >
                {creatingDoc ? "Adding…" : "Add document"}
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Existing documents</h3>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                onClick={() => void loadDocuments()}
                disabled={docsLoading}
              >
                {docsLoading ? "Loading…" : "Refresh"}
              </button>
            </div>

            {docsLoading ? (
              <p className="mt-3 text-sm text-gray-600">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No company documents configured yet.</p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--primary-soft)]/40">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold text-gray-700">Name</th>
                      <th className="px-3 py-2 font-semibold text-gray-700">Type</th>
                      <th className="px-3 py-2 font-semibold text-gray-700">Mandatory</th>
                      <th className="px-3 py-2 font-semibold text-gray-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {docs.map((d: any) => (
                      <tr key={String(d.id)}>
                        <td className="px-3 py-2 font-medium text-gray-900">{String(d.name ?? "")}</td>
                        <td className="px-3 py-2 text-gray-700">{d.kind === "digital_signature" ? "Digital signature" : "Upload"}</td>
                        <td className="px-3 py-2 text-gray-700">{d.is_mandatory ? "Yes" : "No"}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                              onClick={() => startEditDoc(d)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                              onClick={() => setDeleteDocId(String(d.id))}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {editDocId && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Edit document</h3>
                <button type="button" className="text-sm font-semibold text-gray-700 hover:opacity-80 transition" onClick={cancelEditDoc}>
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-sm sm:col-span-1">
                  <span className="text-gray-600">Document name</span>
                  <input
                    value={editDocName}
                    onChange={(e) => setEditDocName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="text-sm sm:col-span-1">
                  <span className="text-gray-600">Type</span>
                  <select
                    value={editDocKind}
                    onChange={(e) => setEditDocKind(e.target.value as DocKind)}
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="upload">Upload</option>
                    <option value="digital_signature">Digital signature</option>
                  </select>
                </label>
                <label className="text-sm sm:col-span-1 flex items-end gap-2">
                  <input type="checkbox" checked={editDocMandatory} onChange={(e) => setEditDocMandatory(e.target.checked)} />
                  <span className="text-gray-700 font-medium">Mandatory</span>
                </label>
                {editDocKind === "digital_signature" && (
                  <label className="text-sm sm:col-span-3">
                    <span className="text-gray-600">Signature content text</span>
                    <textarea
                      value={editDocContent}
                      onChange={(e) => setEditDocContent(e.target.value)}
                      rows={5}
                      className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  onClick={cancelEditDoc}
                  disabled={savingDoc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition disabled:opacity-50"
                  onClick={() => void saveEditedDoc()}
                  disabled={savingDoc || !editDocName.trim()}
                >
                  {savingDoc ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {deleteDocId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm text-amber-900">
                Delete this document? This may fail if employees already have submissions linked to it.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 transition disabled:opacity-50"
                  onClick={() => setDeleteDocId(null)}
                  disabled={deletingDoc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                  onClick={() => void deleteCompanyDoc(deleteDocId)}
                  disabled={deletingDoc}
                >
                  {deletingDoc ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

