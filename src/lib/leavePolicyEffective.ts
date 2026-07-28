import {
  leaveYearStart,
  leaveUnitsInWindow,
  monthsInclusive,
  type ApprovedLeave,
  type LeavePolicy,
} from "@/lib/leavePolicy";

export type LeavePolicyVersionRow = {
  id?: string;
  leave_type_id: string;
  company_id?: string;
  accrual_method: string;
  monthly_accrual_rate: number | null;
  annual_quota: number | null;
  prorate_on_join: boolean;
  reset_month: number | null;
  reset_day: number | null;
  allow_carryover?: boolean | null;
  carryover_limit?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  request_enabled?: boolean | null;
  created_at?: string | null;
  HRMS_leave_types?: {
    name?: string;
    is_paid?: boolean;
    code?: string | null;
    payslip_slot?: string | null;
  } | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function ymdOnly(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

export function isValidYmd(value: string): boolean {
  return YMD.test(value);
}

/** Inclusive effective window: effective_from <= ymd <= effective_to (or open-ended). */
export function policyAppliesOnDate(
  policy: { effective_from?: string | null; effective_to?: string | null },
  ymd: string,
): boolean {
  const d = ymdOnly(ymd);
  if (!isValidYmd(d)) return false;
  const from = ymdOnly(policy.effective_from) || "2000-01-01";
  const to = policy.effective_to != null ? ymdOnly(policy.effective_to) : null;
  if (from && isValidYmd(from) && d < from) return false;
  if (to && isValidYmd(to) && d > to) return false;
  return true;
}

export function dayBeforeYmd(ymd: string): string {
  const d = ymdOnly(ymd);
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function dayAfterYmd(ymd: string): string {
  const d = ymdOnly(ymd);
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function toLeavePolicy(row: LeavePolicyVersionRow): LeavePolicy {
  return {
    leave_type_id: row.leave_type_id,
    accrual_method: row.accrual_method as LeavePolicy["accrual_method"],
    monthly_accrual_rate: row.monthly_accrual_rate,
    annual_quota: row.annual_quota,
    prorate_on_join: Boolean(row.prorate_on_join),
    reset_month: Number(row.reset_month ?? 1),
    reset_day: Number(row.reset_day ?? 1),
    allow_carryover: Boolean(row.allow_carryover),
    carryover_limit: row.carryover_limit ?? null,
    effective_from: ymdOnly(row.effective_from) || "2000-01-01",
    effective_to: row.effective_to != null && isValidYmd(ymdOnly(row.effective_to)) ? ymdOnly(row.effective_to) : null,
    request_enabled: row.request_enabled !== false,
  };
}

/** Pick the policy version in force for a leave type on a given date. */
export function selectPolicyForDate(
  policies: LeavePolicyVersionRow[],
  leaveTypeId: string,
  ymd: string,
): LeavePolicyVersionRow | null {
  const d = ymdOnly(ymd);
  const matches = (policies ?? []).filter(
    (p) => p.leave_type_id === leaveTypeId && policyAppliesOnDate(p, d),
  );
  if (!matches.length) return null;
  // Prefer the latest effective_from if overlap slipped through.
  matches.sort((a, b) => ymdOnly(b.effective_from).localeCompare(ymdOnly(a.effective_from)));
  return matches[0] ?? null;
}

/** Current/open versions for table display (one per leave type). */
export function selectCurrentPolicies(
  policies: LeavePolicyVersionRow[],
  asOfYmd: string,
): LeavePolicyVersionRow[] {
  const byType = new Map<string, LeavePolicyVersionRow>();
  for (const p of policies ?? []) {
    if (!policyAppliesOnDate(p, asOfYmd)) continue;
    const prev = byType.get(p.leave_type_id);
    if (!prev || ymdOnly(p.effective_from) >= ymdOnly(prev.effective_from)) {
      byType.set(p.leave_type_id, p);
    }
  }
  return [...byType.values()];
}

export function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cur = ymdOnly(startYmd);
  const end = ymdOnly(endYmd);
  if (!isValidYmd(cur) || !isValidYmd(end) || end < cur) return out;
  while (cur <= end) {
    out.push(cur);
    cur = dayAfterYmd(cur);
  }
  return out;
}

/**
 * Entitlement window = intersection of leave-year window and policy effective dates.
 * Used days for balance are counted only inside this window.
 */
export function policyEntitlementWindow(
  policy: LeavePolicy,
  asOf: Date,
): { start: Date; endExclusive: Date } {
  const yearStart = leaveYearStart(asOf, policy.reset_month, policy.reset_day);
  const yearEndExclusive = new Date(
    Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), yearStart.getUTCDate(), 0, 0, 0, 0),
  );

  const effFrom = new Date((policy.effective_from || "2000-01-01") + "T00:00:00Z");
  const start = effFrom.getTime() > yearStart.getTime() ? effFrom : yearStart;

  let endExclusive = yearEndExclusive;
  if (policy.effective_to) {
    const afterTo = new Date(dayAfterYmd(policy.effective_to) + "T00:00:00Z");
    if (afterTo.getTime() < endExclusive.getTime()) endExclusive = afterTo;
  }

  return { start, endExclusive };
}

export function computeEntitledForPolicyPeriod(
  policy: LeavePolicy,
  joinDate: Date | null,
  asOf: Date,
): number | null {
  const { start, endExclusive } = policyEntitlementWindow(policy, asOf);
  if (asOf.getTime() < start.getTime() || asOf.getTime() >= endExclusive.getTime()) {
    return 0;
  }

  const method = policy.accrual_method;
  if (method === "none") return null;

  const eligibleStart =
    policy.prorate_on_join && joinDate && joinDate.getTime() > start.getTime() ? joinDate : start;
  if (asOf.getTime() < eligibleStart.getTime()) return 0;

  if (method === "monthly") {
    const rate = Number(policy.monthly_accrual_rate ?? 0);
    const m = monthsInclusive(eligibleStart, asOf);
    const entitled = m * rate;
    const capped = policy.annual_quota == null ? entitled : Math.min(entitled, Number(policy.annual_quota));
    return Math.max(0, capped);
  }

  // annual: full quota once for this policy period / leave-year intersection
  const q = policy.annual_quota == null ? 0 : Number(policy.annual_quota);
  return Math.max(0, q);
}

export function computeUsedDaysForPolicyPeriod(
  leaves: ApprovedLeave[],
  leaveTypeId: string,
  policy: LeavePolicy,
  asOf: Date,
): number {
  const { start, endExclusive } = policyEntitlementWindow(policy, asOf);
  let used = 0;
  for (const r of leaves) {
    if (r.leave_type_id !== leaveTypeId) continue;
    used += leaveUnitsInWindow(
      String(r.start_date).slice(0, 10),
      String(r.end_date).slice(0, 10),
      r.total_days,
      start,
      endExclusive,
    ).unitsInWindow;
  }
  return used;
}

/**
 * Validate that every day in [start,end] has an enabled policy for this leave type.
 * Returns an error message or null.
 */
export function validateRequestEnabledAcrossRange(
  policies: LeavePolicyVersionRow[],
  leaveTypeId: string,
  startYmd: string,
  endYmd: string,
  leaveTypeName?: string,
): string | null {
  const days = eachYmdInclusive(startYmd, endYmd);
  if (!days.length) return "Invalid leave date range";

  for (const day of days) {
    const row = selectPolicyForDate(policies, leaveTypeId, day);
    if (!row) {
      return `No leave policy applies for ${day}.`;
    }
    const policy = toLeavePolicy(row);
    if (!policy.request_enabled) {
      const label = leaveTypeName?.trim() || "This leave type";
      return `${label} is not available under the current leave policy.`;
    }
  }
  return null;
}

/** Group contiguous days by policy version for cross-period charge splitting. */
export function policySegmentsForRange(
  policies: LeavePolicyVersionRow[],
  leaveTypeId: string,
  startYmd: string,
  endYmd: string,
): Array<{ startYmd: string; endYmd: string; policy: LeavePolicy }> {
  const days = eachYmdInclusive(startYmd, endYmd);
  const segments: Array<{ startYmd: string; endYmd: string; policy: LeavePolicy }> = [];
  let current: { startYmd: string; endYmd: string; policy: LeavePolicy; key: string } | null = null;

  for (const day of days) {
    const row = selectPolicyForDate(policies, leaveTypeId, day);
    if (!row) continue;
    const policy = toLeavePolicy(row);
    const key = `${policy.effective_from}|${policy.effective_to ?? "open"}`;
    if (!current || current.key !== key) {
      current = { startYmd: day, endYmd: day, policy, key };
      segments.push(current);
    } else {
      current.endYmd = day;
    }
  }
  return segments.map(({ startYmd: s, endYmd: e, policy }) => ({ startYmd: s, endYmd: e, policy }));
}
