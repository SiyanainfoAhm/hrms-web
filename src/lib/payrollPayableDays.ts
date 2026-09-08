/**
 * Calendar-based payroll payable days.
 *
 * Salary payable days are calendar days in the employment ∩ payroll window,
 * minus unpaid leave/LOP and other unpaid absence on working days.
 *
 * Weekends and paid holidays are used for working-day statistics only.
 * They must not be subtracted again from calendar payable days.
 *
 * Existing company weekend rule: Saturday and Sunday (UTC calendar date).
 * There is no sandwich-leave policy and no per-division work-week config.
 *
 * Division assignment is the employee's current HRMS_employees.division_id
 * for the whole period (no effective-dated transfer history).
 */

import { eachYmdInRange, isWeekendYmd } from "@/lib/leaveBookingDays";

export const PAYROLL_WEEKEND_RULE =
  "Saturday and Sunday (UTC date). Existing company rule; not per-division.";

export const MIN_GROSS_HOURS_FULL_ATTENDANCE_DAY = 9;
export const MIN_GROSS_HOURS_HALF_ATTENDANCE_DAY = 4;

export const OFFICE_LEAVE_CODE = "OL";

const APPROVED_LEAVE_STATUSES = new Set(["approved"]);
const IGNORED_LEAVE_STATUSES = new Set(["rejected", "cancelled", "canceled", "pending"]);

export type PayrollHolidayInput = {
  holiday_date: string;
  holiday_end_date?: string | null;
  division_id?: string | null;
  is_optional?: boolean | null;
  name?: string | null;
};

export type PayrollLeaveInput = {
  start_date: string;
  end_date: string;
  total_days?: number | null;
  paid_days?: number | null;
  unpaid_days?: number | null;
  status: string;
  is_paid_type: boolean;
  leave_type_code?: string | null;
  /** When set, a single-day leave of 0.5 is treated as first or second half (same 0.5 charge). */
  session?: "first_half" | "second_half" | "full" | null;
};

export type PayrollAttendanceInput = {
  work_date: string;
  grossHours: number;
};

export type ApplicableHoliday = {
  date: string;
  name: string;
  source: "company" | "division";
  divisionId: string | null;
};

export type PayableDaysBreakdown = {
  periodStart: string;
  periodEnd: string;
  calendarDays: number;
  weekendDays: number;
  holidayDays: number;
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  payableDays: number;
  holidays: ApplicableHoliday[];
  /** True when current division_id is used for every date (no transfer history). */
  divisionAssignmentIsCurrentOnly: true;
};

export type ComputePayableDaysArgs = {
  year: number;
  month: number;
  runDay: number;
  dateOfJoiningYmd?: string | null;
  dateOfLeavingYmd?: string | null;
  employeeDivisionId?: string | null;
  holidays: PayrollHolidayInput[];
  leaves: PayrollLeaveInput[];
  attendance: PayrollAttendanceInput[];
  /** When true, pay the full calendar month and ignore attendance/leave (existing override). */
  fullMonthOverride?: boolean;
};

export function isYmd(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function getDaysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function payrollPeriodBounds(
  year: number,
  month: number,
  runDay: number,
): { periodStart: string; periodEnd: string; daysInMonth: number; runDay: number } {
  const daysInMonth = getDaysInMonthUtc(year, month);
  const day = Math.min(Math.max(1, Math.floor(runDay) || 1), daysInMonth);
  const periodStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { periodStart, periodEnd, daysInMonth, runDay: day };
}

export function attendancePayCreditFromGrossHours(grossHours: number): number {
  if (!Number.isFinite(grossHours) || grossHours <= 0) return 0;
  if (grossHours >= MIN_GROSS_HOURS_FULL_ATTENDANCE_DAY) return 1;
  if (grossHours > MIN_GROSS_HOURS_HALF_ATTENDANCE_DAY) return 0.5;
  return 0;
}

function roundToHalfDay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 2) / 2;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

export function employmentWindow(
  periodStart: string,
  periodEnd: string,
  dateOfJoiningYmd?: string | null,
  dateOfLeavingYmd?: string | null,
): { start: string; end: string } | null {
  let start = periodStart;
  let end = periodEnd;
  if (isYmd(dateOfJoiningYmd)) {
    if (dateOfJoiningYmd > end) return null;
    start = maxYmd(start, dateOfJoiningYmd);
  }
  if (isYmd(dateOfLeavingYmd)) {
    if (dateOfLeavingYmd < start) return null;
    end = minYmd(end, dateOfLeavingYmd);
  }
  if (end < start) return null;
  return { start, end };
}

/**
 * Holidays applicable to one employee in [rangeStart, rangeEnd]:
 * company-wide (division_id null) + that employee's division.
 * Optional holidays are excluded (existing payroll rule).
 * Dates after the run date / outside the range are excluded.
 * Duplicate dates are collapsed; a division-specific name wins over company-wide.
 */
export function applicableHolidaysForEmployee(
  holidays: PayrollHolidayInput[],
  employeeDivisionId: string | null | undefined,
  rangeStart: string,
  rangeEnd: string,
): ApplicableHoliday[] {
  const empDiv = employeeDivisionId ? String(employeeDivisionId) : null;
  const byDate = new Map<string, ApplicableHoliday>();
  for (const h of holidays ?? []) {
    if (h?.is_optional === true) continue;
    const start = String(h.holiday_date ?? "").slice(0, 10);
    if (!isYmd(start)) continue;
    const endRaw = h.holiday_end_date != null ? String(h.holiday_end_date).slice(0, 10) : start;
    const end = isYmd(endRaw) && endRaw >= start ? endRaw : start;
    const divId = h.division_id ? String(h.division_id) : null;
    const source: "company" | "division" = divId ? "division" : "company";
    if (divId && empDiv && divId !== empDiv) continue;
    if (divId && !empDiv) continue;
    const name = (h.name && String(h.name).trim()) || "Holiday";
    for (const ymd of eachYmdInRange(start, end)) {
      if (ymd < rangeStart || ymd > rangeEnd) continue;
      const prev = byDate.get(ymd);
      if (!prev) {
        byDate.set(ymd, { date: ymd, name, source, divisionId: divId });
        continue;
      }
      if (prev.source === "company" && source === "division") {
        byDate.set(ymd, { date: ymd, name, source, divisionId: divId });
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function isWorkingDayYmd(ymd: string, holidayDates: Set<string>): boolean {
  if (!isYmd(ymd)) return false;
  if (isWeekendYmd(ymd)) return false;
  if (holidayDates.has(ymd)) return false;
  return true;
}

function workingDatesInRange(start: string, end: string, holidayDates: Set<string>): string[] {
  return eachYmdInRange(start, end).filter((d) => isWorkingDayYmd(d, holidayDates));
}

function isApprovedLeave(status: string): boolean {
  return APPROVED_LEAVE_STATUSES.has(String(status ?? "").toLowerCase());
}

function isIgnoredLeave(status: string): boolean {
  return IGNORED_LEAVE_STATUSES.has(String(status ?? "").toLowerCase());
}

function isOfficeLeave(code: string | null | undefined): boolean {
  return String(code ?? "").toUpperCase() === OFFICE_LEAVE_CODE;
}

type DayLeaveUnits = { paid: number; unpaid: number };

function allocateLeaveAcrossWorkingDays(leave: PayrollLeaveInput, holidayDates: Set<string>): Map<string, DayLeaveUnits> {
  const out = new Map<string, DayLeaveUnits>();
  if (isIgnoredLeave(leave.status) || !isApprovedLeave(leave.status)) return out;
  if (isOfficeLeave(leave.leave_type_code)) return out;

  const start = String(leave.start_date).slice(0, 10);
  const end = String(leave.end_date).slice(0, 10);
  if (!isYmd(start) || !isYmd(end) || end < start) return out;

  const working = workingDatesInRange(start, end, holidayDates);
  if (!working.length) return out;

  const rawTotal = Number(leave.total_days);
  let total =
    Number.isFinite(rawTotal) && rawTotal > 0
      ? rawTotal
      : leave.session === "first_half" || leave.session === "second_half"
        ? 0.5
        : working.length;

  if (leave.session === "first_half" || leave.session === "second_half") {
    total = Math.min(total, 0.5 * working.length);
  }

  const paidRaw = Number(leave.paid_days);
  const unpaidRaw = Number(leave.unpaid_days);
  let paid = Number.isFinite(paidRaw) && paidRaw >= 0 ? paidRaw : leave.is_paid_type ? total : 0;
  let unpaid = Number.isFinite(unpaidRaw) && unpaidRaw >= 0 ? unpaidRaw : leave.is_paid_type ? 0 : total;
  if (!leave.is_paid_type) {
    unpaid = Number.isFinite(unpaidRaw) && unpaidRaw > 0 ? unpaidRaw : total;
    paid = 0;
  }
  const splitSum = paid + unpaid;
  if (splitSum > 0 && Math.abs(splitSum - total) > 0.001) {
    const scale = total / splitSum;
    paid *= scale;
    unpaid *= scale;
  } else if (splitSum <= 0) {
    if (leave.is_paid_type) paid = total;
    else unpaid = total;
  }

  let remainingPaid = paid;
  let remainingUnpaid = unpaid;
  for (const ymd of working) {
    const room = 1;
    const takePaid = Math.min(room, remainingPaid);
    remainingPaid -= takePaid;
    const takeUnpaid = Math.min(room - takePaid, remainingUnpaid);
    remainingUnpaid -= takeUnpaid;
    if (takePaid > 0 || takeUnpaid > 0) out.set(ymd, { paid: takePaid, unpaid: takeUnpaid });
    if (remainingPaid <= 1e-9 && remainingUnpaid <= 1e-9) break;
  }
  return out;
}

function mergeLeaveUnits(target: Map<string, DayLeaveUnits>, add: Map<string, DayLeaveUnits>): void {
  for (const [ymd, u] of add) {
    const prev = target.get(ymd) || { paid: 0, unpaid: 0 };
    const paid = Math.min(1, prev.paid + u.paid);
    const unpaid = Math.min(1 - paid, prev.unpaid + u.unpaid);
    target.set(ymd, { paid, unpaid });
  }
}

function emptyBreakdown(periodStart: string, periodEnd: string): PayableDaysBreakdown {
  return {
    periodStart,
    periodEnd,
    calendarDays: 0,
    weekendDays: 0,
    holidayDays: 0,
    workingDays: 0,
    presentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    payableDays: 0,
    holidays: [],
    divisionAssignmentIsCurrentOnly: true,
  };
}

export function computePayableDays(args: ComputePayableDaysArgs): PayableDaysBreakdown {
  const { year, month, runDay } = args;
  const { periodStart, periodEnd, daysInMonth } = payrollPeriodBounds(year, month, runDay);

  if (args.fullMonthOverride) {
    return {
      periodStart,
      periodEnd: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
      calendarDays: daysInMonth,
      weekendDays: 0,
      holidayDays: 0,
      workingDays: 0,
      presentDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      absentDays: 0,
      payableDays: daysInMonth,
      holidays: [],
      divisionAssignmentIsCurrentOnly: true,
    };
  }

  const window = employmentWindow(periodStart, periodEnd, args.dateOfJoiningYmd, args.dateOfLeavingYmd);
  if (!window) return emptyBreakdown(periodStart, periodEnd);

  const holidays = applicableHolidaysForEmployee(
    args.holidays,
    args.employeeDivisionId,
    window.start,
    window.end,
  );
  const holidayDates = new Set(holidays.map((h) => h.date));

  const dates = eachYmdInRange(window.start, window.end);
  let weekendDays = 0;
  let holidayDays = 0;
  const working: string[] = [];
  for (const ymd of dates) {
    if (isWeekendYmd(ymd)) {
      weekendDays += 1;
      continue;
    }
    if (holidayDates.has(ymd)) {
      holidayDays += 1;
      continue;
    }
    working.push(ymd);
  }

  const leaveByDay = new Map<string, DayLeaveUnits>();
  const officeLeaveDates = new Set<string>();
  for (const leave of args.leaves ?? []) {
    if (isOfficeLeave(leave.leave_type_code) && isApprovedLeave(leave.status)) {
      const s = String(leave.start_date).slice(0, 10);
      const e = String(leave.end_date).slice(0, 10);
      for (const ymd of workingDatesInRange(s, e, holidayDates)) {
        if (ymd >= window.start && ymd <= window.end) officeLeaveDates.add(ymd);
      }
      continue;
    }
    mergeLeaveUnits(leaveByDay, allocateLeaveAcrossWorkingDays(leave, holidayDates));
  }

  const attendanceCredit = new Map<string, number>();
  for (const row of args.attendance ?? []) {
    const ymd = String(row.work_date).slice(0, 10);
    if (!isYmd(ymd) || ymd < window.start || ymd > window.end) continue;
    if (!isWorkingDayYmd(ymd, holidayDates)) continue;
    const credit = attendancePayCreditFromGrossHours(Number(row.grossHours) || 0);
    attendanceCredit.set(ymd, Math.max(attendanceCredit.get(ymd) || 0, credit));
  }

  let presentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let absentDays = 0;
  for (const ymd of working) {
    const presentRaw = Math.max(attendanceCredit.get(ymd) || 0, officeLeaveDates.has(ymd) ? 1 : 0);
    const leave = leaveByDay.get(ymd) || { paid: 0, unpaid: 0 };
    const paid = Math.min(1, leave.paid);
    const unpaid = Math.min(1 - paid, leave.unpaid);
    const present = Math.min(1, presentRaw);
    const covered = Math.min(1, present + paid + unpaid);
    const absent = Math.max(0, 1 - covered);
    presentDays += present;
    paidLeaveDays += paid;
    unpaidLeaveDays += unpaid;
    absentDays += absent;
  }

  const calendarDays = dates.length;
  const payableDays = clamp(
    roundToHalfDay(calendarDays - unpaidLeaveDays - absentDays),
    0,
    calendarDays,
  );

  return {
    periodStart,
    periodEnd,
    calendarDays,
    weekendDays,
    holidayDays,
    workingDays: working.length,
    presentDays: roundToHalfDay(presentDays),
    paidLeaveDays: roundToHalfDay(paidLeaveDays),
    unpaidLeaveDays: roundToHalfDay(unpaidLeaveDays),
    absentDays: roundToHalfDay(absentDays),
    payableDays,
    holidays,
    divisionAssignmentIsCurrentOnly: true,
  };
}

export function breakdownToPayDayCalc(b: PayableDaysBreakdown): {
  payDays: number;
  unpaidLeaveDays: number;
  attendanceQualifyingDays: number;
  holidayPayDays: number;
  weekendPayDays: number;
  breakdown: PayableDaysBreakdown;
} {
  return {
    payDays: b.payableDays,
    unpaidLeaveDays: b.unpaidLeaveDays,
    attendanceQualifyingDays: b.presentDays,
    holidayPayDays: b.holidayDays,
    weekendPayDays: b.weekendDays,
    breakdown: b,
  };
}

/** Compare stored vs live payable days (half-day precision). */
export function payableDaysDiffer(stored: number, live: number): boolean {
  return roundToHalfDay(stored) !== roundToHalfDay(live);
}

export function isoAfter(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return ta > tb;
}
