"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHrmsSession } from "@/hooks/useHrmsSession";
import { detectIntent } from "@/lib/hrms-agent/intentRouter";
import { dispatchIntent } from "@/lib/hrms-agent/actionRegistry";
import {
  flowRegistry,
  isCancelMessage,
  isFlowId,
  uploadReimbursementAttachment,
  type Flow,
  type FlowField,
  type FlowId,
} from "@/lib/hrms-agent/flows";
import type {
  AgentConfirmationPayload,
  AgentSuggestion,
  AgentTablePayload,
  HrmsAgentIntent,
  HrmsAgentMessage,
} from "@/lib/hrms-agent/types";
import { HrmsAgentMessageBubble } from "./HrmsAgentMessage";
import { HrmsAgentQuickActions } from "./HrmsAgentQuickActions";
import { HrmsAgentConfirmationCard } from "./HrmsAgentConfirmationCard";

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeMsg(partial: Omit<HrmsAgentMessage, "id" | "createdAt">): HrmsAgentMessage {
  return { id: makeId(), createdAt: Date.now(), ...partial };
}

const GREETING_TEXT =
  "Hi! I'm your HRMS Assistant. Use the quick actions below or ask me to punch in, apply leave, or open HR pages.";

function buildGreeting(): HrmsAgentMessage {
  return makeMsg({ role: "assistant", text: GREETING_TEXT });
}

type FlowState = {
  flow: Flow;
  fields: FlowField[];
  slots: Record<string, unknown>;
};

type PendingConfirm = {
  payload: AgentConfirmationPayload;
  /** Original slots from the user's intent (merged into payload.args at submit time). */
  slots: Record<string, unknown>;
  /** When set, this confirmation finalises a flow and the widget calls
   * `flowRegistry[flowId].submit(...)` directly instead of routing back
   * through the action registry. */
  flowId?: FlowId;
};

export function HrmsAgentWidget() {
  const session = useHrmsSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [flowState, setFlowState] = useState<FlowState | null>(null);
  const [messages, setMessages] = useState<HrmsAgentMessage[]>(() => [buildGreeting()]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, pendingConfirm]);

  const canShow = useMemo(() => Boolean(session.id && session.role), [session.id, session.role]);

  const append = useCallback((m: HrmsAgentMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router],
  );

  /* -------------------------- Flow helpers -------------------------- */

  const findNextFieldIndex = useCallback((fields: FlowField[], slots: Record<string, unknown>) => {
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (field.skipIf?.(slots)) continue;
      const v = slots[field.key];
      if (v === undefined || v === null) return i;
      // Optional fields may legitimately store "" after "skip" / empty answer;
      // that must count as filled or we loop forever on the same step.
      if (v === "" && !field.optional) return i;
    }
    return -1;
  }, []);

  /** Build an assistant message that asks the next field's question. */
  const askField = useCallback((field: FlowField) => {
    const text = field.hint ? `${field.prompt}\n${field.hint}` : field.prompt;
    const suggestions: AgentSuggestion[] | undefined =
      field.quickReplies && field.quickReplies.length > 0
        ? field.quickReplies.map((q) => ({ label: q.label, flowAnswer: q.flowAnswer }))
        : field.type === "select" && field.options && field.options.length > 0
          ? field.options.slice(0, 8).map((o) => ({ label: o.label, flowAnswer: o.label }))
          : field.optional
            ? [{ label: "Skip", flowAnswer: "skip" }]
            : undefined;

    append(
      makeMsg({
        role: "assistant",
        text,
        suggestions,
        attachmentPicker: field.type === "attachment",
      }),
    );
  }, [append]);

  /** Move to the next unfilled field; if none, present the confirmation card. */
  const advanceFlow = useCallback(
    async (state: FlowState) => {
      const idx = findNextFieldIndex(state.fields, state.slots);
      if (idx === -1) {
        setBusy(true);
        try {
          const conf = await Promise.resolve(state.flow.buildConfirmation(state.slots));
          setPendingConfirm({
            payload: {
              intent: state.flow.id,
              title: conf.title,
              details: conf.details,
              args: {},
              confirmText: conf.confirmText,
            },
            slots: state.slots,
            flowId: state.flow.id,
          });
          append(makeMsg({ role: "assistant", text: conf.title }));
        } finally {
          setBusy(false);
        }
        return;
      }
      askField(state.fields[idx]);
    },
    [append, askField, findNextFieldIndex],
  );

  const cancelFlow = useCallback(
    (reason?: string) => {
      if (!flowState) return;
      const title = flowState.flow.title.toLowerCase();
      setFlowState(null);
      setPendingConfirm(null);
      append(
        makeMsg({
          role: "assistant",
          text: reason ?? `Cancelled. Your ${title} was not submitted.`,
        }),
      );
    },
    [append, flowState],
  );

  const startFlow = useCallback(
    async (flowId: FlowId, prefillSlots: Record<string, unknown>) => {
      setBusy(true);
      try {
        const flow = flowRegistry[flowId];
        const fields = await flow.prepareFields();
        // Pre-fill any slots the intent router already extracted (e.g. date,
        // amount). We only keep values whose key matches a real field.
        const validKeys = new Set(fields.map((f) => f.key));
        const seeded: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(prefillSlots)) {
          if (validKeys.has(k) && v != null && v !== "") seeded[k] = v;
        }
        const state: FlowState = { flow, fields, slots: seeded };
        setFlowState(state);
        append(makeMsg({ role: "assistant", text: flow.introText }));
        await advanceFlow(state);
      } catch (e: unknown) {
        append(
          makeMsg({
            role: "assistant",
            text: e instanceof Error ? e.message : "Could not start that flow.",
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [advanceFlow, append],
  );

  /** Apply a typed answer (text or click-suggestion text) to the current flow step. */
  const handleFlowAnswer = useCallback(
    async (rawAnswer: string) => {
      if (!flowState) return;
      const idx = findNextFieldIndex(flowState.fields, flowState.slots);
      if (idx === -1) return;
      const field = flowState.fields[idx];

      if (field.type === "attachment") {
        append(
          makeMsg({
            role: "assistant",
            text: "Please use the `Attach file` button above to upload a receipt.",
            attachmentPicker: true,
          }),
        );
        return;
      }

      const trimmed = rawAnswer.trim();
      let parsed: unknown = trimmed;
      if (field.parse) parsed = field.parse(trimmed, flowState.slots);

      if (parsed === null || parsed === undefined) {
        const hint = field.hint ? `\n${field.hint}` : "";
        append(
          makeMsg({
            role: "assistant",
            text: `I couldn't read that. ${field.prompt}${hint}`,
            suggestions:
              field.quickReplies && field.quickReplies.length > 0
                ? field.quickReplies.map((q) => ({ label: q.label, flowAnswer: q.flowAnswer }))
                : field.type === "select" && field.options
                  ? field.options.slice(0, 8).map((o) => ({ label: o.label, flowAnswer: o.label }))
                  : field.optional
                    ? [{ label: "Skip", flowAnswer: "skip" }]
                    : undefined,
          }),
        );
        return;
      }

      // For select fields, store the parsed id as the slot value AND a label
      // for confirmation rendering.
      const newSlots: Record<string, unknown> = { ...flowState.slots, [field.key]: parsed };
      if (field.type === "select" && field.options) {
        const matched = field.options.find((o) => o.id === parsed);
        if (matched) {
          newSlots[`_${field.key}Label`] = matched.label;
          if (field.key === "leaveTypeId") {
            newSlots._leaveTypeCode = matched.code ?? "";
            newSlots._leaveTypeIsPaid = matched.isPaid ?? true;
          }
        }
      }

      // Per-field semantic validation (e.g. weekend / overlap for leave dates).
      // Run AFTER parsing so the validator sees the canonical value, but
      // BEFORE we commit and advance.
      if (field.validate) {
        setBusy(true);
        try {
          const err = await field.validate(parsed, newSlots);
          if (typeof err === "string" && err.trim()) {
            const hint = field.hint ? `\n${field.hint}` : "";
            append(
              makeMsg({
                role: "assistant",
                text: `${err}\n${field.prompt}${hint}`,
              }),
            );
            return;
          }
        } catch {
          // Soft-fail: if validation throws, don't block — server-side rules
          // still run on submit.
        } finally {
          setBusy(false);
        }
      }

      const next: FlowState = { ...flowState, slots: newSlots };
      setFlowState(next);
      await advanceFlow(next);
    },
    [advanceFlow, append, findNextFieldIndex, flowState],
  );

  /* -------------------------- Attachment picker -------------------------- */

  const triggerAttachmentPicker = useCallback(() => {
    if (uploading || !flowState) return;
    fileInputRef.current?.click();
  }, [flowState, uploading]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      e.target.value = "";
      if (!file || !flowState) return;
      const idx = findNextFieldIndex(flowState.fields, flowState.slots);
      if (idx === -1) return;
      const field = flowState.fields[idx];
      if (field.type !== "attachment") return;

      append(makeMsg({ role: "user", text: `Attached: ${file.name}` }));
      setUploading(true);
      try {
        const url = await uploadReimbursementAttachment(file);
        const newSlots: Record<string, unknown> = { ...flowState.slots, [field.key]: url };
        const next: FlowState = { ...flowState, slots: newSlots };
        setFlowState(next);
        append(makeMsg({ role: "assistant", text: "Receipt uploaded." }));
        await advanceFlow(next);
      } catch (err: unknown) {
        append(
          makeMsg({
            role: "assistant",
            text: err instanceof Error ? err.message : "Upload failed. Please try again.",
            attachmentPicker: true,
          }),
        );
      } finally {
        setUploading(false);
      }
    },
    [advanceFlow, append, findNextFieldIndex, flowState],
  );

  /* -------------------------- Intent dispatch -------------------------- */

  const runIntent = useCallback(
    async (
      intent: HrmsAgentIntent,
      slots: Record<string, unknown> = {},
      opts?: { confirmed?: boolean },
    ) => {
      // Multi-step flows: leave/reimbursement go through the conversational
      // state machine instead of the one-shot action registry.
      if (
        !opts?.confirmed &&
        !flowState &&
        (intent === "leave_request" || intent === "reimbursement_request")
      ) {
        await startFlow(intent, slots);
        return;
      }

      setBusy(true);
      try {
        const result = await dispatchIntent(
          { role: session.role, navigate },
          { intent, slots, confirmed: opts?.confirmed === true },
        );

        if (result.confirmation) {
          setPendingConfirm({ payload: result.confirmation, slots });
          append(makeMsg({ role: "assistant", text: result.reply }));
        } else {
          append(
            makeMsg({
              role: "assistant",
              text: result.reply,
              table: result.table,
              suggestions: result.suggestions,
            }),
          );
        }
      } catch (e: unknown) {
        append(
          makeMsg({
            role: "assistant",
            text: e instanceof Error ? e.message : "Something went wrong.",
          }),
        );
      } finally {
        setBusy(false);
      }
    },
    [append, flowState, navigate, session.role, startFlow],
  );

  /* -------------------------- Send / cancel -------------------------- */

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || uploading) return;
    setInput("");
    append(makeMsg({ role: "user", text }));

    // Cancel keywords short-circuit any active state.
    if (isCancelMessage(text)) {
      if (flowState) {
        cancelFlow();
        return;
      }
      if (pendingConfirm) {
        setPendingConfirm(null);
        append(makeMsg({ role: "assistant", text: "Cancelled. No changes were made." }));
        return;
      }
      append(makeMsg({ role: "assistant", text: "Nothing active to cancel." }));
      return;
    }

    // While a flow is running, treat every message as an answer to the
    // current step.
    if (flowState) {
      void handleFlowAnswer(text);
      return;
    }

    // Otherwise: detect intent + dispatch.
    const result = detectIntent(text);
    await runIntent(result.intent, result.slots);
  }, [append, busy, cancelFlow, flowState, handleFlowAnswer, input, pendingConfirm, runIntent, uploading]);

  /* -------------------------- Confirmation handling -------------------------- */

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const pc = pendingConfirm;
    setPendingConfirm(null);
    setBusy(true);
    try {
      if (pc.flowId && flowState && flowState.flow.id === pc.flowId) {
        const reply = await flowState.flow.submit(flowState.slots);
        setFlowState(null);
        append(makeMsg({ role: "assistant", text: reply }));
      } else {
        const merged = { ...pc.slots, ...pc.payload.args };
        const result = await dispatchIntent(
          { role: session.role, navigate },
          { intent: pc.payload.intent, slots: merged, confirmed: true },
        );
        append(
          makeMsg({
            role: "assistant",
            text: result.reply,
            table: result.table,
            suggestions: result.suggestions,
          }),
        );
      }
    } catch (e: unknown) {
      append(
        makeMsg({
          role: "assistant",
          text: e instanceof Error ? e.message : "Something went wrong.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [append, flowState, navigate, pendingConfirm, session.role]);

  const handleCancelConfirm = useCallback(() => {
    setPendingConfirm(null);
    if (flowState) {
      cancelFlow();
    } else {
      append(makeMsg({ role: "assistant", text: "Cancelled. No changes were made." }));
    }
  }, [append, cancelFlow, flowState]);

  /* -------------------------- Row actions (approver tables) -------------------------- */

  const handleRowAction = useCallback(
    (rowId: string, action: "approve" | "reject", tableKind: AgentTablePayload["kind"]) => {
      const isLeave = tableKind === "pending_leaves";
      const isReimb = tableKind === "pending_reimbursements";
      if (!isLeave && !isReimb) return;
      const intent: HrmsAgentIntent = isLeave
        ? action === "approve"
          ? "approve_leave"
          : "reject_leave"
        : action === "approve"
          ? "approve_reimbursement"
          : "reject_reimbursement";
      void runIntent(intent, { id: rowId });
    },
    [runIntent],
  );

  /* -------------------------- Suggestion clicks -------------------------- */

  const handleSuggestion = useCallback(
    (s: AgentSuggestion) => {
      // Flow answer takes priority when a flow is running.
      if (s.flowAnswer != null && flowState) {
        append(makeMsg({ role: "user", text: s.label }));
        void handleFlowAnswer(s.flowAnswer);
        return;
      }
      // Otherwise treat as an intent dispatch (existing behaviour).
      if (s.intent) {
        void runIntent(s.intent, s.slots ?? {});
      }
    },
    [append, flowState, handleFlowAnswer, runIntent],
  );

  /* -------------------------- Clear chat -------------------------- */

  const handleClearChat = useCallback(() => {
    setMessages([buildGreeting()]);
    setPendingConfirm(null);
    setFlowState(null);
    setInput("");
  }, []);

  /* -------------------------- Quick action picker -------------------------- */

  const handleQuickAction = useCallback(
    (action: { intent: HrmsAgentIntent; label: string; slots?: Record<string, unknown> }) => {
      // Search-employee gets a focused input prefill rather than running blind.
      if (action.intent === "search_employee" && !flowState) {
        setInput("find employee ");
        return;
      }
      append(makeMsg({ role: "user", text: action.label }));
      if (isFlowId(action.intent)) {
        void startFlow(action.intent, {});
        return;
      }
      void runIntent(action.intent, action.slots ?? {});
    },
    [append, flowState, runIntent, startFlow],
  );

  if (!canShow) return null;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        aria-label={open ? "Close HRMS Assistant" : "Open HRMS Assistant"}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" />
          </svg>
        )}
      </button>

      {/* Hidden file input shared by the attachment step. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-[80] flex max-h-[80vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 bg-[var(--primary)] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold leading-tight">HRMS Assistant</p>
              <p className="text-[11px] leading-tight text-white/80">
                Ask me to punch in, apply leave, or open HR pages
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Clear chat"
                title="Clear chat"
                onClick={handleClearChat}
                className="rounded-md p-1 text-white/90 hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h12z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Minimise"
                title="Minimise"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-white/90 hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.map((m) => (
              <HrmsAgentMessageBubble
                key={m.id}
                message={m}
                onSuggestionClick={handleSuggestion}
                onRowAction={handleRowAction}
                onPickAttachment={triggerAttachmentPicker}
                uploading={uploading}
              />
            ))}
            {(busy || uploading) && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  {uploading ? "Uploading…" : "Working…"}
                </div>
              </div>
            )}
          </div>

          {/* Confirmation card */}
          {pendingConfirm && (
            <div className="border-t border-slate-100 bg-white px-3 py-3">
              <HrmsAgentConfirmationCard
                payload={pendingConfirm.payload}
                loading={busy}
                onConfirm={() => void handleConfirm()}
                onCancel={handleCancelConfirm}
              />
            </div>
          )}

          {/* Quick actions */}
          <HrmsAgentQuickActions
            role={session.role}
            disabled={busy || uploading || !!pendingConfirm}
            onPick={handleQuickAction}
          />

          {/* Input */}
          <form
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                flowState
                  ? `${flowState.flow.title} — type your answer or \`cancel\``
                  : "Ask me anything…"
              }
              disabled={busy || uploading || !!pendingConfirm}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={busy || uploading || !!pendingConfirm || !input.trim()}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </form>

          <p className="bg-white px-3 pb-2 text-center text-[10px] text-slate-400">
            Actions follow your HRMS permissions.
          </p>
        </div>
      )}
    </>
  );
}
