import type { HrmsAgentIntent, IntentResult } from "./types";
import { findNavTarget } from "./navigationMap";

/**
 * Lightweight deterministic intent router. Pluggable: we can swap this
 * out for an LLM-backed parser later (see actionRegistry.ts header).
 *
 * Goal: zero false positives on action verbs. We intentionally bias
 * toward `fallback` when a message is ambiguous so users land in the
 * "did you mean…" suggestion path.
 */

type MatchRule = {
  intent: HrmsAgentIntent;
  /** All patterns must match (ANDed). */
  patterns: RegExp[];
  /** Extract slots from the matched message. */
  extract?: (text: string) => Record<string, string | number | boolean | null>;
};

const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const AMOUNT_RE = /(?:rs\.?|inr|₹)?\s*(\d{1,3}(?:[,\d]{0,9})(?:\.\d{1,2})?)/i;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function extractDate(text: string): string | null {
  const iso = ISO_DATE_RE.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/\btoday\b/i.test(text)) return todayYmd();
  if (/\btomorrow\b/i.test(text)) return tomorrowYmd();
  return null;
}

function extractAmount(text: string): number | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const cleaned = m[1].replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const rules: MatchRule[] = [
  // Attendance
  {
    intent: "punch_in",
    patterns: [/\b(punch|check)\s*(me\s*)?in\b/i],
  },
  {
    intent: "punch_out",
    patterns: [/\b(punch|check)\s*(me\s*)?out\b|final\s*check\s*out/i],
  },
  {
    intent: "lunch_out",
    patterns: [/\b(start|begin|going\s*for|out\s*for|check\s*out\s*for)\s*lunch\b/i],
  },
  {
    intent: "lunch_in",
    patterns: [/\b(end|finished?|back\s*from|in\s*from|check\s*in\s*after)\s*lunch\b/i],
  },
  {
    intent: "attendance_status",
    patterns: [/\b(attendance|status|today\s*status|where\s*am\s*i|am\s*i\s*punched)\b/i],
  },

  // Leave
  {
    intent: "leave_balance",
    patterns: [/\bleave\s*balance\b|how\s*much\s*leave|how\s*many\s*leaves/i],
  },
  {
    intent: "leave_request",
    patterns: [/\b(apply|request|take|need|book)\b.*\bleave\b|\bleave\b.*\b(apply|request|take)\b/i],
    extract: (t) => {
      const date = extractDate(t);
      return { startDate: date, endDate: date };
    },
  },

  // Reimbursement
  {
    intent: "reimbursement_request",
    patterns: [/\b(reimburs|expense|claim|petrol|fuel|cab|taxi|lodging|hotel)\b/i],
    extract: (t) => {
      const amount = extractAmount(t);
      const dateMatch = extractDate(t);
      return { amount, claimDate: dateMatch };
    },
  },

  // Payslip
  {
    intent: "payslip_summary",
    patterns: [/\b(payslip|pay\s*slip|salary\s*slip|last\s*pay|net\s*pay)\b/i],
  },

  // HR/Admin lists
  {
    intent: "pending_leaves",
    patterns: [/\bpending\s*leave|leaves?\s*to\s*approve|leave\s*requests\b/i],
  },
  {
    intent: "pending_reimbursements",
    patterns: [/\bpending\s*reimbursement|expenses?\s*to\s*approve|claims?\s*to\s*approve/i],
  },

  // Employee search
  {
    intent: "search_employee",
    patterns: [/\b(find|search|look\s*up)\b.*\b(employee|user|staff)\b|\bemployee\s+([a-z0-9._@\-\s]+)/i],
    extract: (t) => {
      // Try patterns like "find employee Gourav" / "search employee john@x.com"
      const m =
        /\b(?:find|search|look\s*up|show)\b\s+(?:employee\s+|user\s+|staff\s+)?(.+)$/i.exec(t.trim()) ||
        /\bemployee\s+([a-z0-9._@\-\s]+)$/i.exec(t.trim());
      const q = m ? m[1].trim() : "";
      return { query: q };
    },
  },

  // Help
  { intent: "help", patterns: [/^\s*help\b|what can you do|what do you do/i] },
];

export function detectIntent(message: string): IntentResult {
  const text = (message || "").trim();
  if (!text) return { intent: "fallback", slots: {} };

  // Navigation: "open X", "go to X", "show X page"
  const navMatch = /^(?:open|go\s*to|show|navigate\s*to|take\s*me\s*to)\s+(.+)$/i.exec(text);
  if (navMatch) {
    const target = findNavTarget(navMatch[1]);
    return {
      intent: "navigate",
      slots: { query: navMatch[1].trim(), targetKey: target?.key ?? null, href: target?.href ?? null },
    };
  }

  for (const r of rules) {
    if (r.patterns.every((p) => p.test(text))) {
      return {
        intent: r.intent,
        slots: r.extract ? r.extract(text) : {},
      };
    }
  }

  return { intent: "fallback", slots: { raw: text } };
}
