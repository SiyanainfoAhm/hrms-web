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

/**
 * For leave booking / paid–unpaid split: accrual must not use a calendar date
 * before "today", or backdated start dates under-count monthly accrual vs the
 * live balance (which uses today). For future starts, accrual runs through the
 * leave start month as before.
 */
export function asOfYmdForLeaveEntitlementBooking(startYmd: string, todayYmd: string): string {
  const s = String(startYmd).slice(0, 10);
  const t = String(todayYmd).slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(s)) return iso.test(t) ? t : s;
  if (!iso.test(t)) return s;
  return s < t ? t : s;
}

export function overlapDaysInclusive(start: Date, end: Date, windowStart: Date, windowEndExclusive: Date): number {
  const s = Math.max(start.getTime(), windowStart.getTime());
  const e = Math.min(end.getTime(), windowEndExclusive.getTime() - 1);
  if (e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inclusive calendar length of [startYmd, endYmd] (UTC date-only yyyy-mm-dd). */
export function calendarSpanInclusiveYmd(startYmd: string, endYmd: string): number {
  const sy = String(startYmd).slice(0, 10);
  const ey = String(endYmd).slice(0, 10);
  const s = new Date(sy + "T00:00:00Z").getTime();
  const e = new Date(ey + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

/**
 * Leave quantity (days) falling inside [windowStart, windowEndExclusive), prorated from `total_days`
 * across the leave's calendar span. Supports half-day rows (e.g. PL/SL `total_days = 0.5` on one day, HL).
 */
export function leaveUnitsInWindow(
  startYmd: string,
  endYmd: string,
  totalDays: number | null | undefined,
  windowStart: Date,
  windowEndExclusive: Date,
): { overlapCalendarDays: number; unitsInWindow: number } {
  const sy = String(startYmd).slice(0, 10);
  const ey = String(endYmd).slice(0, 10);
  const start = new Date(sy + "T00:00:00Z");
  const end = new Date(ey + "T00:00:00Z");
  const overlapCalendarDays = overlapDaysInclusive(start, end, windowStart, windowEndExclusive);
  if (overlapCalendarDays <= 0) return { overlapCalendarDays: 0, unitsInWindow: 0 };
  const spanCal = calendarSpanInclusiveYmd(sy, ey);
  const spanSafe = Math.max(1, spanCal);
  const totalRaw = Number(totalDays);
  const totalSafe = Number.isFinite(totalRaw) && totalRaw > 0 ? totalRaw : spanSafe;
  return { overlapCalendarDays, unitsInWindow: totalSafe * (overlapCalendarDays / spanSafe) };
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
    const sy = String(r.start_date).slice(0, 10);
    const ey = String(r.end_date).slice(0, 10);
    used += leaveUnitsInWindow(sy, ey, r.total_days, yearStart, yearEndExclusive).unitsInWindow;
  }
  return used;
}

