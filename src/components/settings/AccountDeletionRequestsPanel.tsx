"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/ToastProvider";
import { SkeletonTable } from "@/components/common/Skeleton";

type DeletionRequest = {
  id: string;
  user_id: string;
  email: string;
  status: string;
  requested_at: string;
  scheduled_deletion_at: string;
  user_name?: string | null;
  user_role?: string | null;
  employee_code?: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AccountDeletionRequestsPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account-deletion/requests", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load requests");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "cancelled" | "completed") {
    const label = status === "completed" ? "permanently delete this user" : "cancel this deletion request";
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/account-deletion/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Update failed");
      showToast("success", status === "completed" ? "User deleted" : "Request cancelled");
      await load();
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Account deletion requests</h2>
          <p className="muted text-sm">
            Employees can request deletion at{" "}
            <a href="/account-deletion" className="font-medium text-[var(--primary)] hover:underline">
              /account-deletion
            </a>
            . Access is revoked immediately; data is scheduled for removal within 90 days unless you complete or
            cancel the request.
          </p>
        </div>
        <button type="button" className="btn btn-outline shrink-0" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="mt-4">
          <SkeletonTable rows={4} columns={5} />
        </div>
      ) : pending.length === 0 && requests.length === 0 ? (
        <p className="muted mt-6 text-sm">No deletion requests yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Requested</th>
                <th className="py-2 pr-3">Scheduled</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]/60">
                  <td className="py-3 pr-3">
                    <div className="font-medium">{r.user_name || r.email}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {r.email}
                      {r.employee_code ? ` · ${r.employee_code}` : ""}
                      {r.user_role ? ` · ${r.user_role}` : ""}
                    </div>
                  </td>
                  <td className="py-3 pr-3">{fmtDate(r.requested_at)}</td>
                  <td className="py-3 pr-3">{fmtDate(r.scheduled_deletion_at)}</td>
                  <td className="py-3 pr-3 capitalize">{r.status}</td>
                  <td className="py-3">
                    {r.status === "pending" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-outline text-xs"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, "cancelled")}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn bg-red-600 text-xs text-white hover:bg-red-700"
                          disabled={busyId === r.id}
                          onClick={() => void setStatus(r.id, "completed")}
                        >
                          Delete now
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
