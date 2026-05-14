/** Leave booking: working days (Mon–Fri UTC), company holidays, overlap with pending/approved leave. */

export type HolidayRow = {
  holiday_date: string;
  holiday_end_date?: string | null;
  division_id?: string | null;
};

export type ExistingLeaveRow = {
  startDate: string;
  endDate: string;
  status: string;
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Monday–Friday in UTC (same as `YYYY-MM-DD` + `T00:00:00Z` weekday on web). */
export function isWeekendYmd(ymd: string): boolean {
  if (!isYmd(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

function ymdUtc(y: number, m: number, day: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Inclusive YMD range; empty if invalid. */
export function eachYmdInRange(startYmd: string, endYmd: string): string[] {
  if (!isYmd(startYmd) || !isYmd(endYmd) || endYmd < startYmd) return [];
  const out: string[] = [];
  let y = parseInt(startYmd.slice(0, 4), 10);
  let mo = parseInt(startYmd.slice(5, 7), 10);
  let d = parseInt(startYmd.slice(8, 10), 10);
  const end = new Date(`${endYmd}T00:00:00Z`).getTime();
  for (;;) {
    const cur = ymdUtc(y, mo, d);
    const t = new Date(`${cur}T00:00:00Z`).getTime();
    if (t > end) break;
    out.push(cur);
    const dt = new Date(`${cur}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    y = dt.getUTCFullYear();
    mo = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return out;
}

function expandHolidayToYmdSet(h: HolidayRow, employeeDivisionId: string | null | undefined): Set<string> {
  const set = new Set<string>();
  const start = String(h.holiday_date ?? "").slice(0, 10);
  if (!isYmd(start)) return set;
  const div = h.division_id ? String(h.division_id) : null;
  const empDiv = employeeDivisionId ? String(employeeDivisionId) : null;
  // Match /api/holidays GET for employees: company-wide OR same division when employee has a division.
  if (empDiv) {
    if (div && div !== empDiv) return set;
  }
  const endRaw = h.holiday_end_date ? String(h.holiday_end_date).slice(0, 10) : "";
  const end = isYmd(endRaw) && endRaw >= start ? endRaw : start;
  for (const ymd of eachYmdInRange(start, end)) set.add(ymd);
  return set;
}

export function buildHolidayYmdSet(holidays: HolidayRow[], employeeDivisionId: string | null | undefined): Set<string> {
  const acc = new Set<string>();
  for (const h of holidays ?? []) {
    for (const y of expandHolidayToYmdSet(h, employeeDivisionId)) acc.add(y);
  }
  return acc;
}

export function rangesOverlapYmd(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!isYmd(aStart) || !isYmd(aEnd) || !isYmd(bStart) || !isYmd(bEnd)) return false;
  return !(aEnd < bStart || aStart > bEnd);
}

export function findBlockingLeaveOverlap(
  existing: ExistingLeaveRow[],
  startYmd: string,
  endYmd: string,
): ExistingLeaveRow | null {
  for (const row of existing ?? []) {
    const st = String(row.status ?? "").toLowerCase();
    if (st !== "pending" && st !== "approved") continue;
    const s = String(row.startDate ?? "").slice(0, 10);
    const e = String(row.endDate ?? "").slice(0, 10);
    if (!isYmd(s) || !isYmd(e)) continue;
    if (rangesOverlapYmd(startYmd, endYmd, s, e)) return row;
  }
  return null;
}

export type LeaveBookingSummary = {
  calendarSpanDays: number;
  weekendDaysExcluded: number;
  holidayDaysExcluded: number;
  workingDaysInRange: number;
  /** Days charged against leave balance / stored as total_days (after HL / half-day rules). */
  chargeableDays: number;
  overlapError: string | null;
};

export function computeLeaveBookingSummary(args: {
  startYmd: string;
  endYmd: string;
  holidays: HolidayRow[];
  employeeDivisionId: string | null | undefined;
  existingLeaves: ExistingLeaveRow[];
  leaveTypeCodeUpper: string;
  /** Single calendar day, non-HL: optional half-day (0.5). */
  isHalfDay: boolean;
}): LeaveBookingSummary {
  const { startYmd, endYmd, holidays, employeeDivisionId, existingLeaves, leaveTypeCodeUpper, isHalfDay } = args;
  const overlap = findBlockingLeaveOverlap(existingLeaves, startYmd, endYmd);
  if (overlap) {
    return {
      calendarSpanDays: 0,
      weekendDaysExcluded: 0,
      holidayDaysExcluded: 0,
      workingDaysInRange: 0,
      chargeableDays: 0,
      overlapError: "You already have leave (pending or approved) that overlaps these dates.",
    };
  }

  const days = eachYmdInRange(startYmd, endYmd);
  const calendarSpanDays = days.length;
  const holidaySet = buildHolidayYmdSet(holidays, employeeDivisionId);
  let weekendDaysExcluded = 0;
  let holidayDaysExcluded = 0;
  let workingDaysInRange = 0;
  for (const ymd of days) {
    if (isWeekendYmd(ymd)) {
      weekendDaysExcluded += 1;
      continue;
    }
    if (holidaySet.has(ymd)) {
      holidayDaysExcluded += 1;
      continue;
    }
    workingDaysInRange += 1;
  }

  const isHl = leaveTypeCodeUpper === "HL";
  let chargeableDays = 0;
  if (isHl) {
    chargeableDays = workingDaysInRange * 0.5;
  } else if (isHalfDay) {
    chargeableDays = workingDaysInRange >= 1 ? 0.5 : 0;
  } else {
    chargeableDays = workingDaysInRange;
  }

  return {
    calendarSpanDays,
    weekendDaysExcluded,
    holidayDaysExcluded,
    workingDaysInRange,
    chargeableDays,
    overlapError: null,
  };
}
