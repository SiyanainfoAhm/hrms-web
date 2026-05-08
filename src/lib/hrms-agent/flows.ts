/**
 * Conversational multi-step flows for write actions whose existing form
 * collects multiple fields. The chatbot walks the user through one field
 * at a time, validating each answer locally, then submits via the same
 * service the form uses — so server-side rules (paid/unpaid split,
 * attachment-required, payroll period derivation, role gates) all still
 * fire exactly once on the server.
 *
 * Each flow:
 *   1. `prepareFields()` is called once when the user starts the flow
 *      (this is where we fetch dynamic data, e.g. leave types).
 *   2. The widget walks `fields` in order, asking the user each prompt;
 *      it skips fields whose slot was pre-filled (e.g. by the intent
 *      router extracting a date from "apply leave tomorrow").
 *   3. After all fields are filled, `buildConfirmation()` produces the
 *      summary card. On confirm, `submit()` runs against the service.
 */
import {
  createLeaveRequest,
  getLeaveBalancePreview,
  getLeaveTypes,
  getMyLeaveRequests,
  type CreateLeaveRequestInput,
} from "@/services/leaveService";
import {
  createReimbursementRequest,
  uploadReimbursementAttachment,
} from "@/services/reimbursementService";

export type FlowFieldType = "select" | "date" | "amount" | "text" | "longtext" | "attachment";

export type FlowSelectOption = {
  id: string;
  label: string;
  code?: string | null;
  /** When false, leave type is unpaid (matches HRMS_leave_types.is_paid). */
  isPaid?: boolean;
};

export type FlowField = {
  key: string;
  /** Bot's question for this field. */
  prompt: string;
  type: FlowFieldType;
  optional?: boolean;
  /** When true, this step is skipped entirely (e.g. half-day only for single calendar day). */
  skipIf?: (slots: Record<string, unknown>) => boolean;
  /** For `select`. Loaded by `prepareFields()` if not provided up front. */
  options?: FlowSelectOption[];
  /** Optional pill buttons (same UX as select chips). */
  quickReplies?: { label: string; flowAnswer: string }[];
  /** Hint shown right under the prompt. */
  hint?: string;
  /** Custom parser for free-text answers; return `null` to reject the input. */
  parse?: (raw: string, slots: Record<string, unknown>) => unknown | null;
  /**
   * Runs after `parse` succeeds. Return a non-empty error string to reject
   * the value with a user-facing message and re-ask the same field; return
   * `null` to accept and advance. Useful for async checks (overlap, etc.).
   */
  validate?: (
    value: unknown,
    slots: Record<string, unknown>,
  ) => Promise<string | null> | string | null;
};

export type FlowId = "leave_request" | "reimbursement_request";

export type FlowConfirmation = {
  title: string;
  details: string;
  confirmText?: string;
};

export type Flow = {
  id: FlowId;
  title: string;
  introText: string;
  prepareFields(): Promise<FlowField[]>;
  buildConfirmation(slots: Record<string, unknown>): FlowConfirmation | Promise<FlowConfirmation>;
  /** Returns a success message to show in chat. */
  submit(slots: Record<string, unknown>): Promise<string>;
};

/* -------------------------- Shared parsers -------------------------- */

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Accepts: "today", "tomorrow", DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD. */
export function parseAnyDate(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t === "today") return todayYmd();
  if (t === "tomorrow") return tomorrowYmd();
  const dmy = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(t);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    if (!isRealCalendarDate(yyyy, mm, dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (iso) {
    const yyyy = iso[1];
    const mm = iso[2].padStart(2, "0");
    const dd = iso[3].padStart(2, "0");
    if (!isRealCalendarDate(yyyy, mm, dd)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function isRealCalendarDate(yyyy: string, mm: string, dd: string): boolean {
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(yyyy) &&
    d.getUTCMonth() + 1 === Number(mm) &&
    d.getUTCDate() === Number(dd)
  );
}

/** Returns true if `ymd` (YYYY-MM-DD) lands on Saturday or Sunday in UTC. */
function isWeekendYmd(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function weekdayName(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
}

/**
 * Two YYYY-MM-DD ranges overlap when each range starts on/before the other ends.
 */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,₹\s]/g, "").replace(/^rs\.?/i, "").replace(/inr$/i, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ymdHuman(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(ymd);
}

function diffDaysInclusive(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

function fmtDays(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function isHalfLeaveType(slots: Record<string, unknown>): boolean {
  return String(slots._leaveTypeCode ?? "").toUpperCase() === "HL";
}

/** Same rules as the Request leave form: half-day toggle only for one calendar day, non–Half-Leave types. */
export function isSingleDayHalfDayEligible(slots: Record<string, unknown>): boolean {
  const start = typeof slots.startDate === "string" ? slots.startDate : "";
  const end = typeof slots.endDate === "string" ? slots.endDate : "";
  const base = diffDaysInclusive(start, end);
  return Boolean(start && end && start === end && base === 1 && !isHalfLeaveType(slots));
}

/** Total calendar leave units (full days, 0.5 for optional half-day, or HL-type scaling). */
export function computeLeaveTotalDays(slots: Record<string, unknown>): number {
  const start = typeof slots.startDate === "string" ? slots.startDate : "";
  const end = typeof slots.endDate === "string" ? slots.endDate : "";
  const baseDays = diffDaysInclusive(start, end);
  if (isHalfLeaveType(slots)) return baseDays * 0.5;
  if (isSingleDayHalfDayEligible(slots) && slots.isHalfDay === true) return 0.5;
  return baseDays;
}

/* -------------------------- Leave flow -------------------------- */

export const leaveFlow: Flow = {
  id: "leave_request",
  title: "Leave request",
  introText: "Let's create a leave request. You can type `cancel` at any time to abort.",

  async prepareFields() {
    let typeOptions: FlowSelectOption[] = [];
    try {
      const types = await getLeaveTypes();
      typeOptions = types.map((t) => ({
        id: t.id,
        label: t.name,
        code: t.code ?? null,
        isPaid: t.is_paid !== false,
      }));
    } catch {
      typeOptions = [];
    }

    return [
      {
        key: "leaveTypeId",
        prompt:
          typeOptions.length > 0
            ? "Which leave type? Pick one below or type the name."
            : "Which leave type? Type the leave type name.",
        type: "select",
        options: typeOptions,
        parse: (raw) => {
          const q = raw.trim().toLowerCase();
          if (!q) return null;
          // Match by exact id, exact label, or prefix.
          const byId = typeOptions.find((o) => o.id.toLowerCase() === q);
          if (byId) return byId.id;
          const byLabel = typeOptions.find((o) => o.label.toLowerCase() === q);
          if (byLabel) return byLabel.id;
          const byPrefix = typeOptions.find((o) => o.label.toLowerCase().startsWith(q));
          if (byPrefix) return byPrefix.id;
          return null;
        },
      },
      {
        key: "startDate",
        prompt: "What's the start date? Use `dd-mm-yyyy` format.",
        type: "date",
        hint: "e.g. `12-05-2026`. You can also type `today` or `tomorrow`.",
        parse: (raw) => parseAnyDate(raw),
        validate: (value) => {
          const ymd = String(value);
          if (isWeekendYmd(ymd)) {
            return `Start date ${ymdHuman(ymd)} falls on a ${weekdayName(ymd)}. Please pick a working day (Mon–Fri).`;
          }
          return null;
        },
      },
      {
        key: "endDate",
        prompt: "What's the end date? Use `dd-mm-yyyy` (or type `same` for a single-day leave).",
        type: "date",
        hint: "e.g. `13-05-2026` or `same`.",
        parse: (raw, slots) => {
          if (/^same$/i.test(raw.trim())) {
            return typeof slots.startDate === "string" ? slots.startDate : null;
          }
          const d = parseAnyDate(raw);
          if (!d || typeof slots.startDate !== "string") return d;
          return d < slots.startDate ? null : d;
        },
        validate: async (value, slots) => {
          const endYmd = String(value);
          const startYmd = typeof slots.startDate === "string" ? (slots.startDate as string) : "";
          if (!startYmd) return null;
          if (isWeekendYmd(endYmd)) {
            return `End date ${ymdHuman(endYmd)} falls on a ${weekdayName(endYmd)}. Please pick a working day (Mon–Fri).`;
          }
          // Overlap check against the user's existing pending/approved leaves.
          try {
            const mine = await getMyLeaveRequests();
            const conflict = mine.find((r) => {
              if (r.status !== "pending" && r.status !== "approved") return false;
              return rangesOverlap(startYmd, endYmd, String(r.startDate), String(r.endDate));
            });
            if (conflict) {
              const range =
                conflict.startDate === conflict.endDate
                  ? ymdHuman(String(conflict.startDate))
                  : `${ymdHuman(String(conflict.startDate))} → ${ymdHuman(String(conflict.endDate))}`;
              return `You already have a ${conflict.status} ${conflict.leaveTypeName || "leave"} for ${range}. Please pick different dates or cancel the existing request first.`;
            }
          } catch {
            // If the overlap check fails (network/API), don't block the flow —
            // the server-side rules still run on submit.
          }
          return null;
        },
      },
      {
        key: "isHalfDay",
        prompt: "Is this a **half day** (0.5) or a **full day** (1)? Only shown when start and end are the same calendar day.",
        type: "text",
        hint: "Type `yes` / `half` for half day, or `no` / `full` for a full day.",
        skipIf: (slots) => !isSingleDayHalfDayEligible(slots),
        quickReplies: [
          { label: "Full day (1)", flowAnswer: "no" },
          { label: "Half day (0.5)", flowAnswer: "yes" },
        ],
        parse: (raw, slots) => {
          if (!isSingleDayHalfDayEligible(slots)) return null;
          const t = raw.trim().toLowerCase();
          if (/^(yes|y|half|0\.5|true|1)$/i.test(t)) return true;
          if (/^(no|n|full|false|0)$/i.test(t)) return false;
          return null;
        },
      },
      {
        key: "reason",
        prompt: "Reason? (Optional — type `skip` if you don't want to add one.)",
        type: "longtext",
        optional: true,
        parse: (raw) => {
          const t = raw.trim();
          if (!t || /^skip$/i.test(t)) return ""; // empty string = skipped
          return t;
        },
      },
    ];
  },

  async buildConfirmation(slots) {
    const startDate = String(slots.startDate ?? "");
    const endDate = String(slots.endDate ?? "");
    const reason = typeof slots.reason === "string" && slots.reason.trim() ? String(slots.reason) : null;
    const typeLabel =
      typeof slots._leaveTypeLabel === "string" && slots._leaveTypeLabel ? slots._leaveTypeLabel : "Leave";
    const totalDays = computeLeaveTotalDays(slots);
    const unpaidType = slots._leaveTypeIsPaid === false;

    let paidDays = 0;
    let unpaidDays = 0;
    let balanceNote = "";
    if (unpaidType) {
      paidDays = 0;
      unpaidDays = totalDays;
    } else {
      try {
        const bals = await getLeaveBalancePreview(String(slots.leaveTypeId), startDate);
        const bal = bals[0];
        const remaining = bal?.remaining;
        paidDays = remaining == null ? totalDays : Math.min(totalDays, Math.max(0, remaining));
        unpaidDays = totalDays - paidDays;
      } catch {
        balanceNote = "\n(Could not load balance preview; final paid/unpaid may differ after submit.)";
        paidDays = totalDays;
        unpaidDays = 0;
      }
    }

    const halfLine = isSingleDayHalfDayEligible(slots)
      ? `Half day: ${slots.isHalfDay === true ? "Yes (0.5 day)" : "No (full day)"}`
      : isHalfLeaveType(slots)
        ? "Note: This leave type counts each calendar day as 0.5."
        : null;

    const lines = [
      `Type: ${typeLabel}`,
      `Dates: ${ymdHuman(startDate)} → ${ymdHuman(endDate)}`,
      halfLine,
      `Total: ${fmtDays(totalDays)} day(s)`,
      `Estimated: ${fmtDays(paidDays)} paid, ${fmtDays(unpaidDays)} unpaid`,
      reason ? `Reason: ${reason}` : null,
    ].filter(Boolean) as string[];

    return {
      title: "Confirm leave request",
      details: lines.join("\n") + balanceNote,
      confirmText: "Submit",
    };
  },

  async submit(slots) {
    const eligibleHalf = isSingleDayHalfDayEligible(slots);
    const input: CreateLeaveRequestInput = {
      leaveTypeId: String(slots.leaveTypeId),
      startDate: String(slots.startDate),
      endDate: String(slots.endDate),
      reason: typeof slots.reason === "string" && slots.reason.trim() ? String(slots.reason) : undefined,
      ...(eligibleHalf && slots.isHalfDay === true ? { isHalfDay: true } : {}),
    };
    const created = await createLeaveRequest(input);
    return `Leave request submitted (status: ${created.status}). HR has been notified.`;
  },
};

/* -------------------------- Reimbursement flow -------------------------- */

export const reimbursementFlow: Flow = {
  id: "reimbursement_request",
  title: "Reimbursement",
  introText: "Let's submit a reimbursement claim. Type `cancel` at any time to abort.",

  async prepareFields() {
    return [
      {
        key: "category",
        prompt: "What's the category?",
        type: "text",
        hint: "Examples: `Travel`, `Medical`, `Meals`, `Internet`.",
        parse: (raw) => {
          const t = raw.trim();
          return t.length >= 2 && t.length <= 60 ? t : null;
        },
      },
      {
        key: "amount",
        prompt: "How much (in INR)?",
        type: "amount",
        hint: "Type a positive number, e.g. `450` or `1,250.00`.",
        parse: (raw) => parseAmount(raw),
      },
      {
        key: "claimDate",
        prompt: "When was the expense (claim date)? Use `dd-mm-yyyy` format.",
        type: "date",
        hint: "e.g. `08-05-2026`. You can also type `today`.",
        parse: (raw) => parseAnyDate(raw),
      },
      {
        key: "description",
        prompt: "Describe the expense in one or two lines.",
        type: "longtext",
        parse: (raw) => {
          const t = raw.trim();
          return t.length >= 3 ? t : null;
        },
      },
      {
        key: "attachmentUrl",
        prompt: "Please attach a receipt (PDF or image, max 8 MB). Click `Attach file` below.",
        type: "attachment",
        // No `parse` — the widget handles file selection and uploads via the
        // existing reimbursement upload service before setting this slot.
      },
    ];
  },

  buildConfirmation(slots) {
    const amount = Number(slots.amount ?? 0);
    const claimDate = String(slots.claimDate ?? "");
    const lines = [
      `Category: ${String(slots.category ?? "")}`,
      `Amount: ₹${amount.toLocaleString("en-IN")}`,
      `Claim date: ${ymdHuman(claimDate)}`,
      `Description: ${String(slots.description ?? "")}`,
      `Attachment: ${slots.attachmentUrl ? "uploaded" : "missing"}`,
    ];
    return {
      title: "Confirm reimbursement",
      details: lines.join("\n"),
      confirmText: "Submit claim",
    };
  },

  async submit(slots) {
    const id = await createReimbursementRequest({
      category: String(slots.category),
      amount: Number(slots.amount),
      claimDate: String(slots.claimDate),
      description: String(slots.description),
      attachmentUrl: String(slots.attachmentUrl),
    });
    return `Reimbursement submitted (status: ${id.status}). HR has been notified.`;
  },
};

/* -------------------------- Registry -------------------------- */

export const flowRegistry: Record<FlowId, Flow> = {
  leave_request: leaveFlow,
  reimbursement_request: reimbursementFlow,
};

export function isFlowId(id: string): id is FlowId {
  return id === "leave_request" || id === "reimbursement_request";
}

/** Re-export for the widget. */
export { uploadReimbursementAttachment };

/* -------------------------- Cancel detection -------------------------- */

const CANCEL_RE =
  /^\s*(cancel|abort|stop|nevermind|never\s*mind|quit|exit|forget\s*it|leave\s*it)\s*\.?\s*$/i;

export function isCancelMessage(text: string): boolean {
  return CANCEL_RE.test(text);
}
