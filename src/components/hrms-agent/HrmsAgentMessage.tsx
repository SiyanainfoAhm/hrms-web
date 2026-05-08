"use client";

import type {
  AgentSuggestion,
  AgentTablePayload,
  HrmsAgentMessage as Msg,
} from "@/lib/hrms-agent/types";

function AgentTable({
  table,
  onRowAction,
}: {
  table: AgentTablePayload;
  onRowAction?: (rowId: string, action: "approve" | "reject") => void;
}) {
  const rows = table.rows ?? [];
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]).filter((c) => c.toLowerCase() !== "id");
  const supportsAction =
    onRowAction && (table.kind === "pending_leaves" || table.kind === "pending_reimbursements");

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[420px] text-xs">
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2.5 py-2 text-left font-semibold">
                {c}
              </th>
            ))}
            {supportsAction && <th className="px-2.5 py-2 text-left font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => {
            const id = String(r.id ?? `${table.kind}-${i}`);
            return (
              <tr key={id} className="text-slate-800">
                {columns.map((c) => (
                  <td key={c} className="px-2.5 py-2 align-top whitespace-nowrap">
                    {String((r as Record<string, unknown>)[c] ?? "")}
                  </td>
                ))}
                {supportsAction && (
                  <td className="px-2.5 py-2 align-top">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-md bg-[var(--primary)] px-2 py-1 text-[11px] font-semibold text-white hover:brightness-95"
                        onClick={() => onRowAction!(String(r.id), "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => onRowAction!(String(r.id), "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HrmsAgentMessageBubble({
  message,
  onSuggestionClick,
  onRowAction,
  onPickAttachment,
  uploading,
}: {
  message: Msg;
  onSuggestionClick?: (suggestion: AgentSuggestion) => void;
  onRowAction?: (rowId: string, action: "approve" | "reject", tableKind: AgentTablePayload["kind"]) => void;
  onPickAttachment?: () => void;
  uploading?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isUser
            ? "bg-[var(--primary)] text-white"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <div className="whitespace-pre-line">{message.text}</div>

        {message.table && (
          <AgentTable
            table={message.table}
            onRowAction={
              onRowAction
                ? (id, action) => onRowAction(id, action, message.table!.kind)
                : undefined
            }
          />
        )}

        {message.attachmentPicker && onPickAttachment && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onPickAttachment}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:brightness-95 disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              {uploading ? "Uploading…" : "Attach file"}
            </button>
            <p className="mt-1 text-[10px] text-slate-500">PDF or image, max 8 MB.</p>
          </div>
        )}

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.suggestions.map((s, i) => (
              <button
                key={`${s.intent ?? s.flowAnswer ?? "s"}-${i}`}
                type="button"
                onClick={() => onSuggestionClick?.(s)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  isUser
                    ? "border-white/40 bg-white/15 text-white hover:bg-white/25"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
