/**
 * Maps a detected intent to a concrete action against the existing
 * service layer. Every write action returns either a Confirmation
 * (so the user must press "Confirm" first) or an immediate read-only
 * AgentResult.
 *
 * Design notes:
 *   - All side effects go through src/services/* which in turn call
 *     existing /api/* routes. We never call Supabase directly here,
 *     so role / company / attendance-state / Tauri side-effects are
 *     handled exactly as the original forms did.
 *   - To swap in a real LLM later, replace `intentRouter.detectIntent`
 *     with a remote call (e.g. /api/agent/route that proxies to
 *     OpenAI / a Supabase Edge Function), but keep this registry as
 *     the action layer — the LLM never executes; it only chooses
 *     intent + slots, exactly like detectIntent does today.
 */
import type { RoleId } from "@/config/roleConfig";
import type {
  AgentResult,
  AgentTablePayload,
  HrmsAgentIntent,
} from "./types";
import { canRunIntent } from "./permissions";
import { findNavTarget } from "./navigationMap";

import {
  deriveAttendanceStatusLabel,
  getAgentHeartbeat,
  getCurrentLocation,
  getTodayAttendanceStatus,
  punchIn,
  punchOut,
  toggleBreak,
} from "@/services/attendanceService";
import {
  approveLeaveRequest,
  createLeaveRequest,
  getLeaveBalance,
  getPendingLeaveRequests,
  rejectLeaveRequest,
  type CreateLeaveRequestInput,
} from "@/services/leaveService";
import {
  approveReimbursement,
  getPendingReimbursements,
  rejectReimbursement,
} from "@/services/reimbursementService";
import { searchEmployees } from "@/services/employeeService";
import { getMyLatestPayslip } from "@/services/payslipService";

export type ActionContext = {
  role: RoleId | null | undefined;
  /** Used by `navigate` to push the user to the route. */
  navigate: (href: string) => void;
};

function denied(intent: HrmsAgentIntent): AgentResult {
  return {
    ok: false,
    reply: `Sorry — your role doesn't have permission for "${intent.replace(/_/g, " ")}".`,
  };
}

function ymdHuman(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  if (!m) return String(ymd);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/* -------------------------- Read-only actions -------------------------- */

async function attendanceStatusReply(): Promise<AgentResult> {
  const att = await getTodayAttendanceStatus();
  if (!att?.hasEmployee) {
    return {
      ok: true,
      reply:
        "Your account is not linked to an employee profile yet. Ask HR to complete your employee record before using attendance.",
    };
  }
  const log = att.log;
  const label = deriveAttendanceStatusLabel(log);
  const hb = await getAgentHeartbeat().catch(() => null);
  const agentLine = hb
    ? `\nAgent: ${hb.connected ? "connected" : "disconnected"}${hb.lastSeenAt ? ` (last seen ${fmtTime(hb.lastSeenAt)})` : ""}`
    : "";

  switch (label) {
    case "not_punched_in":
      return {
        ok: true,
        reply: `You're not punched in yet today (${att.workDate ?? "today"}).${agentLine}`,
        suggestions: [{ label: "Punch In", intent: "punch_in" }],
      };
    case "punched_in":
      return {
        ok: true,
        reply: `You're punched in since ${fmtTime(log?.check_in_at)} today.${agentLine}`,
        suggestions: [
          { label: "Start Lunch", intent: "lunch_out" },
          { label: "Punch Out", intent: "punch_out" },
        ],
      };
    case "on_lunch":
      return {
        ok: true,
        reply: `You're on lunch since ${fmtTime(log?.lunch_break_started_at)}.${agentLine}`,
        suggestions: [{ label: "End Lunch", intent: "lunch_in" }],
      };
    case "on_tea":
      return {
        ok: true,
        reply: `You're on a tea break since ${fmtTime(log?.tea_break_started_at)}.${agentLine}`,
        suggestions: [],
      };
    case "completed":
      return {
        ok: true,
        reply: `Today's attendance is complete. Punched out at ${fmtTime(log?.check_out_at)}.${agentLine}`,
      };
  }
}

async function leaveBalanceReply(): Promise<AgentResult> {
  const balances = await getLeaveBalance();
  if (!balances.length) {
    return { ok: true, reply: "No leave balances are configured for your account yet." };
  }
  const table: AgentTablePayload = {
    kind: "leave_balance",
    rows: balances.map((b) => ({
      "Leave type": b.leaveTypeName,
      Type: b.isPaid ? "Paid" : "Unpaid",
      Used: b.used,
      Remaining: b.remaining ?? "∞",
    })),
  };
  return { ok: true, reply: "Here is your current leave balance:", table };
}

async function payslipSummaryReply(): Promise<AgentResult> {
  const slip = await getMyLatestPayslip();
  if (!slip) return { ok: true, reply: "No payslips have been generated for you yet." };
  const lines = [
    `Period: ${slip.periodFormatted ?? slip.periodMonth ?? "—"}`,
    slip.payDays != null ? `Pay days: ${slip.payDays}` : null,
    slip.netPay != null ? `Net pay: ₹${Number(slip.netPay).toLocaleString("en-IN")}` : null,
  ].filter(Boolean);
  return {
    ok: true,
    reply: `Latest payslip:\n${lines.join("\n")}`,
    suggestions: [{ label: "Open My Payslips", intent: "navigate", slots: { targetKey: "payslip" } }],
  };
}

async function pendingLeavesReply(): Promise<AgentResult> {
  const rows = await getPendingLeaveRequests();
  if (!rows.length) return { ok: true, reply: "No pending leave requests." };
  const table: AgentTablePayload = {
    kind: "pending_leaves",
    rows: rows.map((r) => ({
      id: r.id,
      Employee: r.employeeName ?? r.employeeEmail ?? "—",
      Type: r.leaveTypeName,
      Dates: `${ymdHuman(r.startDate)} → ${ymdHuman(r.endDate)}`,
      Days: r.totalDays,
      Status: r.status,
    })),
  };
  return { ok: true, reply: `${rows.length} pending leave request(s):`, table };
}

async function pendingReimbursementsReply(): Promise<AgentResult> {
  const rows = await getPendingReimbursements();
  if (!rows.length) return { ok: true, reply: "No pending reimbursement claims." };
  const table: AgentTablePayload = {
    kind: "pending_reimbursements",
    rows: rows.map((r) => ({
      id: r.id,
      Employee: r.employeeName ?? r.employeeEmail ?? "—",
      Amount: `₹${Number(r.amount).toLocaleString("en-IN")}`,
      Category: r.category,
      "Claim date": ymdHuman(r.claim_date),
      Status: r.status,
    })),
  };
  return { ok: true, reply: `${rows.length} pending reimbursement(s):`, table };
}

async function searchEmployeeReply(query: string): Promise<AgentResult> {
  const q = query.trim();
  if (!q) {
    return {
      ok: false,
      reply: "Tell me a name, email, or employee code to search for. Example: `find employee Gourav`.",
    };
  }
  const rows = await searchEmployees(q, 8);
  if (!rows.length) {
    return { ok: true, reply: `No employees matched "${q}".` };
  }
  const table: AgentTablePayload = {
    kind: "employees",
    rows: rows.map((e) => ({
      Employee: e.name ?? "—",
      Email: e.email ?? "—",
      Code: e.employee_code ?? "—",
      Department: e.department_name ?? "—",
      Status: e.employment_status ?? "—",
    })),
  };
  return { ok: true, reply: `Found ${rows.length} employee(s) matching "${q}":`, table };
}

/* -------------------------- Confirmation builders -------------------------- */

function attendanceConfirmation(intent: HrmsAgentIntent): AgentResult {
  const map: Record<string, { title: string; details: string; confirmText: string }> = {
    punch_out: {
      title: "Confirm Punch Out",
      details:
        "I'll close today's attendance. End any open lunch/tea break first; the server will reject otherwise.",
      confirmText: "Punch out",
    },
  };
  const cfg = map[intent];
  return {
    ok: true,
    reply: cfg.title,
    confirmation: {
      intent,
      title: cfg.title,
      details: cfg.details,
      args: {},
      confirmText: cfg.confirmText,
    },
  };
}

/* -------------------------- Action runner -------------------------- */

async function runAttendanceAction(intent: HrmsAgentIntent): Promise<AgentResult> {
  switch (intent) {
    case "punch_in": {
      const loc = await getCurrentLocation();
      if (!loc) {
        return {
          ok: false,
          reply: "Location permission is required for punch-in. Please allow location access and try again.",
        };
      }
      const r = await punchIn({ location: loc });
      const warn = r.warning ? `\n${r.warning}` : "";
      return { ok: true, reply: `Punched in at ${fmtTime(r.log.check_in_at)}.${warn}` };
    }
    case "punch_out": {
      const loc = await getCurrentLocation();
      if (!loc) {
        return {
          ok: false,
          reply: "Location permission is required for punch-out. Please allow location access and try again.",
        };
      }
      const r = await punchOut({ location: loc });
      const warn = r.warning ? `\n${r.warning}` : "";
      return { ok: true, reply: `Punched out at ${fmtTime(r.log.check_out_at)}.${warn}` };
    }
    case "lunch_out": {
      const r = await toggleBreak("lunch");
      return { ok: true, reply: `Lunch started at ${fmtTime(r.log.lunch_break_started_at ?? r.log.lunch_check_out_at)}.` };
    }
    case "lunch_in": {
      const r = await toggleBreak("lunch");
      return { ok: true, reply: `Lunch ended at ${fmtTime(r.log.lunch_check_in_at)}.` };
    }
    default:
      return { ok: false, reply: "Unknown attendance action." };
  }
}

/* -------------------------- Public dispatcher -------------------------- */

export type DispatchInput = {
  intent: HrmsAgentIntent;
  slots: Record<string, unknown>;
  /** When true, this is a confirmed write-action — execute it instead of asking. */
  confirmed?: boolean;
};

export async function dispatchIntent(
  ctx: ActionContext,
  input: DispatchInput,
): Promise<AgentResult> {
  const { intent, slots, confirmed } = input;

  if (!canRunIntent(ctx.role, intent)) return denied(intent);

  try {
    switch (intent) {
      case "help":
        return {
          ok: true,
          reply:
            "I can help with attendance (punch in/out, lunch), leave requests and balance, reimbursements, and opening HR pages. Use the quick-action chips below or type a command like `apply leave 2026-05-12` or `claim 450 for petrol`.",
        };

      case "attendance_status":
        return attendanceStatusReply();

      case "leave_balance":
        return leaveBalanceReply();

      case "payslip_summary":
        return payslipSummaryReply();

      case "pending_leaves":
        return pendingLeavesReply();

      case "pending_reimbursements":
        return pendingReimbursementsReply();

      case "search_employee":
        return searchEmployeeReply(String(slots.query ?? ""));

      case "navigate": {
        const href =
          (typeof slots.href === "string" && slots.href) ||
          (typeof slots.targetKey === "string" ? findNavTarget(slots.targetKey)?.href ?? null : null) ||
          (typeof slots.query === "string" ? findNavTarget(slots.query)?.href ?? null : null);
        if (!href) {
          return {
            ok: false,
            reply: "I could not find this screen route in the app.",
          };
        }
        ctx.navigate(href);
        return { ok: true, reply: `Opening ${href}…`, navigatedTo: href };
      }

      /* ----- Write actions: ask for confirmation, then execute on confirm ----- */

      case "punch_in":
      case "lunch_in":
      case "lunch_out":
        return runAttendanceAction(intent);

      case "punch_out":
        if (!confirmed) return attendanceConfirmation(intent);
        return runAttendanceAction(intent);

      case "leave_request": {
        const leaveTypeId = typeof slots.leaveTypeId === "string" ? slots.leaveTypeId : "";
        const startDate = typeof slots.startDate === "string" ? slots.startDate : "";
        const endDate = typeof slots.endDate === "string" ? slots.endDate : startDate;
        const reason = typeof slots.reason === "string" ? slots.reason : undefined;

        if (!leaveTypeId || !startDate || !endDate) {
          return {
            ok: true,
            reply:
              "I need a leave type and dates to submit. Open the Leave page and I'll pre-fill what I know.",
            suggestions: [{ label: "Open Leave page", intent: "navigate", slots: { targetKey: "leave" } }],
          };
        }
        if (!confirmed) {
          return {
            ok: true,
            reply: "Confirm Leave Request",
            confirmation: {
              intent: "leave_request",
              title: "Confirm Leave Request",
              details: `${ymdHuman(startDate)} → ${ymdHuman(endDate)}${reason ? `\nReason: ${reason}` : ""}`,
              args: { leaveTypeId, startDate, endDate, reason } satisfies Partial<CreateLeaveRequestInput>,
              confirmText: "Submit",
            },
          };
        }
        const created = await createLeaveRequest({ leaveTypeId, startDate, endDate, reason });
        return {
          ok: true,
          reply: `Leave request submitted (${created.status}).`,
          suggestions: [{ label: "Open Leave page", intent: "navigate", slots: { targetKey: "leave" } }],
        };
      }

      case "reimbursement_request": {
        const amount = typeof slots.amount === "number" ? slots.amount : null;
        const category = typeof slots.category === "string" ? slots.category : "";
        const claimDate = typeof slots.claimDate === "string" ? slots.claimDate : "";

        if (!amount || !category || !claimDate) {
          return {
            ok: true,
            reply:
              "Reimbursements need an amount, category, claim date, description, and an attachment. Open the Reimbursements page to attach the file and submit.",
            suggestions: [
              { label: "Open Reimbursements", intent: "navigate", slots: { targetKey: "reimbursement" } },
            ],
          };
        }
        // Even with all text fields, the existing API requires an attachment URL.
        // We never bypass that — push the user to the form.
        return {
          ok: true,
          reply: `Got it: ₹${amount} for ${category} on ${ymdHuman(claimDate)}. Reimbursements require an attachment, so I'll open the page where you can upload the receipt and submit.`,
          suggestions: [
            { label: "Open Reimbursements", intent: "navigate", slots: { targetKey: "reimbursement" } },
          ],
        };
      }

      case "approve_leave":
      case "reject_leave": {
        const id = typeof slots.id === "string" ? slots.id : "";
        if (!id) return { ok: false, reply: "Missing request id." };
        if (!confirmed) {
          return {
            ok: true,
            reply: intent === "approve_leave" ? "Approve this leave request?" : "Reject this leave request?",
            confirmation: {
              intent,
              title: intent === "approve_leave" ? "Approve leave" : "Reject leave",
              details:
                intent === "approve_leave"
                  ? "This will approve the request and notify the employee."
                  : "This will reject the request and notify the employee.",
              args: { id },
              confirmText: intent === "approve_leave" ? "Approve" : "Reject",
              danger: intent === "reject_leave",
            },
          };
        }
        if (intent === "approve_leave") await approveLeaveRequest(id);
        else await rejectLeaveRequest(id, typeof slots.rejectionReason === "string" ? slots.rejectionReason : undefined);
        return { ok: true, reply: intent === "approve_leave" ? "Leave approved." : "Leave rejected." };
      }

      case "approve_reimbursement":
      case "reject_reimbursement": {
        const id = typeof slots.id === "string" ? slots.id : "";
        if (!id) return { ok: false, reply: "Missing claim id." };
        if (!confirmed) {
          return {
            ok: true,
            reply:
              intent === "approve_reimbursement"
                ? "Approve this reimbursement?"
                : "Reject this reimbursement?",
            confirmation: {
              intent,
              title: intent === "approve_reimbursement" ? "Approve reimbursement" : "Reject reimbursement",
              details:
                intent === "approve_reimbursement"
                  ? "This will approve the claim and notify the employee."
                  : "This will reject the claim and notify the employee.",
              args: { id },
              confirmText: intent === "approve_reimbursement" ? "Approve" : "Reject",
              danger: intent === "reject_reimbursement",
            },
          };
        }
        if (intent === "approve_reimbursement") await approveReimbursement(id);
        else
          await rejectReimbursement(
            id,
            typeof slots.rejectionReason === "string" ? slots.rejectionReason : undefined,
          );
        return {
          ok: true,
          reply:
            intent === "approve_reimbursement" ? "Reimbursement approved." : "Reimbursement rejected.",
        };
      }

      case "fallback":
      default:
        return {
          ok: true,
          reply:
            "I didn't catch that. Try a quick-action button below, or ask things like `punch me in`, `apply leave tomorrow`, `pending leaves`, or `open payroll`.",
        };
    }
  } catch (e: unknown) {
    return {
      ok: false,
      reply: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}
