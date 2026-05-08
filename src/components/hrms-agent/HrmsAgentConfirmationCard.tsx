"use client";

import type { AgentConfirmationPayload } from "@/lib/hrms-agent/types";

export function HrmsAgentConfirmationCard({
  payload,
  loading,
  onConfirm,
  onCancel,
}: {
  payload: AgentConfirmationPayload;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{payload.title}</p>
      {payload.details && (
        <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{payload.details}</p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
            payload.danger ? "bg-red-600 hover:bg-red-700" : "bg-[var(--primary)] hover:brightness-95"
          }`}
        >
          {loading ? "Working…" : payload.confirmText ?? "Confirm"}
        </button>
      </div>
    </div>
  );
}
