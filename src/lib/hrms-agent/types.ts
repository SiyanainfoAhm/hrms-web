import type { RoleId } from "@/config/roleConfig";

export type HrmsAgentRole = RoleId;

export type HrmsAgentIntent =
  | "punch_in"
  | "punch_out"
  | "lunch_in"
  | "lunch_out"
  | "attendance_status"
  | "leave_request"
  | "leave_balance"
  | "reimbursement_request"
  | "payslip_summary"
  | "pending_leaves"
  | "approve_leave"
  | "reject_leave"
  | "pending_reimbursements"
  | "approve_reimbursement"
  | "reject_reimbursement"
  | "search_employee"
  | "navigate"
  | "help"
  | "fallback";

/** Detected intent + structured slots extracted from the user message. */
export type IntentResult = {
  intent: HrmsAgentIntent;
  /** Free-form parameters extracted from the user message (date, amount, name…). */
  slots: Record<string, string | number | boolean | null>;
  /** When non-null, action layer must collect missing slots before executing. */
  needsMoreInfo?: string[];
};

export type ChatRole = "user" | "assistant" | "system";

export type AgentTablePayload = {
  kind: "pending_leaves" | "pending_reimbursements" | "employees" | "leave_balance" | "payslips";
  rows: Record<string, unknown>[];
};

export type AgentConfirmationPayload = {
  intent: HrmsAgentIntent;
  title: string;
  /** Plain text body shown to the user. */
  details: string;
  /** Pre-filled action arguments — passed back into the action when confirmed. */
  args: Record<string, unknown>;
  confirmText?: string;
  danger?: boolean;
};

/** A clickable chip on an assistant bubble. Either dispatches a new intent OR
 * (when in a multi-step flow) injects a typed answer for the current step. */
export type AgentSuggestion = {
  label: string;
  /** When set, clicking dispatches this chatbot intent (legacy / one-shot path). */
  intent?: HrmsAgentIntent;
  slots?: Record<string, unknown>;
  /** When set AND a flow is active, clicking is treated as if the user had
   * typed this string as the answer to the current flow step. */
  flowAnswer?: string;
};

export type HrmsAgentMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  /** Optional rich payloads rendered alongside the message text. */
  table?: AgentTablePayload;
  confirmation?: AgentConfirmationPayload;
  /** Inline CTA chips. */
  suggestions?: AgentSuggestion[];
  /** When true the bubble shows an "Attach file" button that opens a file
   * picker for the active flow's attachment step. */
  attachmentPicker?: boolean;
};

/** Result of executing an action via the action registry. */
export type AgentResult = {
  ok: boolean;
  /** Bot reply text to show in the next assistant message. */
  reply: string;
  table?: AgentTablePayload;
  /** When the action wants the user to confirm before execution, return this. */
  confirmation?: AgentConfirmationPayload;
  suggestions?: { label: string; intent: HrmsAgentIntent; slots?: Record<string, unknown> }[];
  /** When the action requested a navigation, this URL was already pushed. */
  navigatedTo?: string;
};
