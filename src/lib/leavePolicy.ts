export type LeaveAccrualMethod = "monthly" | "annual" | "none";

export type LeaveType = {
  id: string;
  name: string;
  is_paid: boolean;
};

export type LeavePolicy = {
  leave_type_id: string;
  accrual_method: LeaveAccrualMethod;
  monthly_accrual_rate: number | null;
  annual_quota: number | null;
  prorate_on_join: boolean;
  reset_month: number; // 1-12
  reset_day: number; // 1-31 (validated by caller)
  allow_carryover: boolean;
  carryover_limit: number | null;
};

export type ApprovedLeave = {
  leave_type_id: string;
  start_date: string; // yyyy-mm-dd
  end_date: string; // yyyy-mm-dd
  total_days: number;
};

function toUtcMidnight(d: string): Date {
  // Treat stored dates as yyyy-mm-dd in UTC.
  return new Date(d + "T00:00:00Z");
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function leaveYearStart(asOf: Date, resetMonth: number, resetDay: number): Date {
  const m = clampNumber(resetMonth, 1, 12) - 1;
  const day = clampNumber(resetDay, 1, 31);

  const candidateThisYear = new Date(Date.UTC(asOf.getUTCFullYear(), m, day, 0, 0, 0, 0));
  if (asOf.getTime() >= candidateThisYear.getTime()) return candidateThisYear;
  return new Date(Date.UTC(asOf.getUTCFullYear() - 1, m, day, 0, 0, 0, 0));
}

export function monthsInclusive(from: Date, to: Date): number {
  const fromY = from.getUTCFullYear();
  const fromM = from.getUTCMonth();
  const toY = to.getUTCFullYear();
  const toM = to.getUTCMonth();
  const diff = (toY * 12 + toM) - (fromY * 12 + fromM);
  return diff >= 0 ? diff + 1 : 0;
}

export function overlapDaysInclusive(start: Date, end: Date, windowStart: Date, windowEndExclusive: Date): number {
  const s = Math.max(start.getTime(), windowStart.getTime());
  const e = Math.min(end.getTime(), windowEndExclusive.getTime() - 1);
  if (e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

export function computeEntitled(policy: LeavePolicy, joinDate: Date | null, asOf: Date): number | null {
  const method = policy.accrual_method;
  if (method === "none") return null;

  const yearStart = leaveYearStart(asOf, policy.reset_month, policy.reset_day);
  const eligibleStart =
    policy.prorate_on_join && joinDate
      ? (joinDate.getTime() > yearStart.getTime() ? joinDate : yearStart)
      : yearStart;
  if (asOf.getTime() < eligibleStart.getTime()) return 0;

  if (method === "monthly") {
    const rate = Number(policy.monthly_accrual_rate ?? 0);
    const m = monthsInclusive(eligibleStart, asOf);
    const entitled = m * rate;
    const capped = policy.annual_quota == null ? entitled : Math.min(entitled, Number(policy.annual_quota));
    return Math.max(0, capped);
  }

  // annual: grant full annual quota for the leave year (no proration).
  // Sick leave, etc. typically give full quota (e.g. 3 days) regardless of join date.
  const q = policy.annual_quota == null ? 0 : Number(policy.annual_quota);
  return Math.max(0, q);
}

export function computeUsedDaysForYear(
  leaves: ApprovedLeave[],
  leaveTypeId: string,
  yearStart: Date,
  yearEndExclusive: Date
): number {
  let used = 0;
  for (const r of leaves) {
    if (r.leave_type_id !== leaveTypeId) continue;
    const s = toUtcMidnight(r.start_date);
    const e = toUtcMidnight(r.end_date);
    used += overlapDaysInclusive(s, e, yearStart, yearEndExclusive);
  }
  return used;
}

