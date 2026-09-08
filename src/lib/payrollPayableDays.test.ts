import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applicableHolidaysForEmployee,
  computePayableDays,
  isoAfter,
  payableDaysDiffer,
  payrollPeriodBounds,
  type PayrollAttendanceInput,
  type PayrollHolidayInput,
  type PayrollLeaveInput,
} from "./payrollPayableDays";

const DIV_A = "div-a";
const DIV_B = "div-b";

function ymdHours(dates: string[], hours = 9): PayrollAttendanceInput[] {
  return dates.map((work_date) => ({ work_date, grossHours: hours }));
}

function weekdayDatesInMonth(year: number, month: number, skip = new Set<string>()): string[] {
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    const ymd = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (skip.has(ymd)) continue;
    out.push(ymd);
  }
  return out;
}

function weekdayDatesAugust2026(): string[] {
  // Aug 2026 weekdays excluding Independence Day Sat 15 (weekend) and Raksha Bandhan Fri 28.
  return weekdayDatesInMonth(2026, 8, new Set(["2026-08-15", "2026-08-28"]));
}

const AUG_HOLIDAYS: PayrollHolidayInput[] = [
  {
    name: "Independence Day",
    holiday_date: "2026-08-15",
    division_id: DIV_A,
    is_optional: false,
  },
  {
    name: "Raksha Bandhan",
    holiday_date: "2026-08-28",
    division_id: DIV_A,
    is_optional: false,
  },
];

function gouravLikeAttendance(omit: string[] = []): PayrollAttendanceInput[] {
  const omitSet = new Set(omit);
  return ymdHours(weekdayDatesAugust2026().filter((d) => !omitSet.has(d)));
}

describe("payrollPeriodBounds", () => {
  it("uses month start through run date for a 31-day month", () => {
    const b = payrollPeriodBounds(2026, 8, 31);
    assert.equal(b.periodStart, "2026-08-01");
    assert.equal(b.periodEnd, "2026-08-31");
    assert.equal(b.daysInMonth, 31);
  });

  it("clamps a partial run date and excludes later days", () => {
    const b = payrollPeriodBounds(2026, 8, 20);
    assert.equal(b.periodEnd, "2026-08-20");
  });

  it("handles February leap year", () => {
    const b = payrollPeriodBounds(2024, 2, 29);
    assert.equal(b.daysInMonth, 29);
    assert.equal(b.periodEnd, "2024-02-29");
  });

  it("handles February non-leap year", () => {
    const b = payrollPeriodBounds(2025, 2, 31);
    assert.equal(b.daysInMonth, 28);
    assert.equal(b.periodEnd, "2025-02-28");
  });
});

describe("August 2026 payable days (Gourav-shaped)", () => {
  it("Case A: 1.5 unpaid leave → payableDays 29.5", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10", "2026-08-13"]).concat([
        { work_date: "2026-08-13", grossHours: 6.28 },
      ]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          paid_days: 0,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
          leave_type_code: "UNPAID",
        },
        {
          start_date: "2026-08-13",
          end_date: "2026-08-13",
          total_days: 0.5,
          paid_days: 0,
          unpaid_days: 0.5,
          status: "approved",
          is_paid_type: false,
          leave_type_code: "UNPAID",
        },
      ],
    });
    assert.equal(r.calendarDays, 31);
    assert.equal(r.weekendDays, 10);
    assert.equal(r.holidayDays, 1);
    assert.equal(r.unpaidLeaveDays, 1.5);
    assert.equal(r.payableDays, 29.5);
  });

  it("Case B: 1 paid + 0.5 unpaid → payableDays 30.5", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10", "2026-08-13"]).concat([
        { work_date: "2026-08-13", grossHours: 6.28 },
      ]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          paid_days: 1,
          unpaid_days: 0,
          status: "approved",
          is_paid_type: true,
          leave_type_code: "CL",
        },
        {
          start_date: "2026-08-13",
          end_date: "2026-08-13",
          total_days: 0.5,
          paid_days: 0,
          unpaid_days: 0.5,
          status: "approved",
          is_paid_type: true,
          leave_type_code: "CL",
        },
      ],
    });
    assert.equal(r.paidLeaveDays, 1);
    assert.equal(r.unpaidLeaveDays, 0.5);
    assert.equal(r.payableDays, 30.5);
  });

  it("Case C: all 1.5 days paid → payableDays 31", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10", "2026-08-13"]).concat([
        { work_date: "2026-08-13", grossHours: 6.28 },
      ]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          paid_days: 1,
          unpaid_days: 0,
          status: "approved",
          is_paid_type: true,
          leave_type_code: "CL",
        },
        {
          start_date: "2026-08-13",
          end_date: "2026-08-13",
          total_days: 0.5,
          paid_days: 0.5,
          unpaid_days: 0,
          status: "approved",
          is_paid_type: true,
          leave_type_code: "CL",
        },
      ],
    });
    assert.equal(r.paidLeaveDays, 1.5);
    assert.equal(r.unpaidLeaveDays, 0);
    assert.equal(r.absentDays, 0);
    assert.equal(r.payableDays, 31);
  });

  it("does not subtract weekends or the Saturday holiday from calendar payable days", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(),
      leaves: [],
    });
    assert.equal(r.weekendDays, 10);
    assert.equal(r.holidayDays, 1);
    assert.equal(r.workingDays, 20);
    assert.equal(r.payableDays, 31);
  });
});

describe("holiday and weekend overlap", () => {
  it("counts a holiday on Saturday once as weekend, not as an extra holiday day", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(),
      leaves: [],
    });
    assert.ok(r.holidays.some((h) => h.date === "2026-08-15"));
    assert.equal(r.holidayDays, 1);
    assert.equal(r.weekendDays, 10);
  });

  it("does not reduce payable days when leave overlaps a holiday", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(),
      leaves: [
        {
          start_date: "2026-08-28",
          end_date: "2026-08-28",
          total_days: 1,
          paid_days: 0,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
          leave_type_code: "UNPAID",
        },
      ],
    });
    assert.equal(r.unpaidLeaveDays, 0);
    assert.equal(r.payableDays, 31);
  });

  it("ignores a holiday after the run date", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 20,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: ymdHours(
        weekdayDatesAugust2026().filter((d) => d <= "2026-08-20"),
      ),
      leaves: [],
    });
    assert.equal(r.periodEnd, "2026-08-20");
    assert.equal(r.calendarDays, 20);
    assert.ok(!r.holidays.some((h) => h.date === "2026-08-28"));
    assert.equal(r.payableDays, 20);
  });

  it("ignores a holiday belonging to another division", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: [
        ...AUG_HOLIDAYS,
        { name: "Other Div", holiday_date: "2026-08-21", division_id: DIV_B, is_optional: false },
      ],
      attendance: gouravLikeAttendance(),
      leaves: [],
    });
    assert.ok(!r.holidays.some((h) => h.date === "2026-08-21"));
    assert.equal(r.workingDays, 20);
    assert.equal(r.payableDays, 31);
  });

  it("includes a company-wide holiday once", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: [
        ...AUG_HOLIDAYS,
        { name: "Company Day", holiday_date: "2026-08-21", division_id: null, is_optional: false },
      ],
      attendance: gouravLikeAttendance(["2026-08-21"]),
      leaves: [],
    });
    assert.equal(r.holidays.filter((h) => h.date === "2026-08-21" && h.source === "company").length, 1);
    assert.equal(r.payableDays, 31);
  });

  it("deduplicates duplicate holiday records on the same date", () => {
    const list = applicableHolidaysForEmployee(
      [
        { name: "A", holiday_date: "2026-08-28", division_id: DIV_A },
        { name: "A-dup", holiday_date: "2026-08-28", division_id: DIV_A },
      ],
      DIV_A,
      "2026-08-01",
      "2026-08-31",
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]?.date, "2026-08-28");
  });
});

describe("leave status and half days", () => {
  it("ignores pending, rejected and cancelled leave", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10", "2026-08-11", "2026-08-12"]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          unpaid_days: 1,
          status: "pending",
          is_paid_type: false,
        },
        {
          start_date: "2026-08-11",
          end_date: "2026-08-11",
          total_days: 1,
          unpaid_days: 1,
          status: "rejected",
          is_paid_type: false,
        },
        {
          start_date: "2026-08-12",
          end_date: "2026-08-12",
          total_days: 1,
          unpaid_days: 1,
          status: "cancelled",
          is_paid_type: false,
        },
      ],
    });
    assert.equal(r.unpaidLeaveDays, 0);
    assert.equal(r.absentDays, 3);
    assert.equal(r.payableDays, 28);
  });

  it("counts half-day attendance plus half-day paid leave as a full payable day", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-13"]).concat([
        { work_date: "2026-08-13", grossHours: 6.28 },
      ]),
      leaves: [
        {
          start_date: "2026-08-13",
          end_date: "2026-08-13",
          total_days: 0.5,
          paid_days: 0.5,
          unpaid_days: 0,
          status: "approved",
          is_paid_type: true,
          session: "first_half",
          leave_type_code: "CL",
        },
      ],
    });
    assert.equal(r.paidLeaveDays, 0.5);
    assert.equal(r.presentDays, 19.5);
    assert.equal(r.absentDays, 0);
    assert.equal(r.payableDays, 31);
  });

  it("does not double-count duplicate leave rows on the same date", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10"]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
        },
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
        },
      ],
    });
    assert.equal(r.unpaidLeaveDays, 1);
    assert.equal(r.payableDays, 30);
  });
});

describe("join, leave, and partial month", () => {
  it("prorates calendar days for a mid-month joiner", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      dateOfJoiningYmd: "2026-08-17",
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: ymdHours(weekdayDatesAugust2026().filter((d) => d >= "2026-08-17")),
      leaves: [],
    });
    assert.equal(r.calendarDays, 15);
    assert.equal(r.payableDays, 15);
  });

  it("prorates calendar days for a mid-month exit", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      dateOfLeavingYmd: "2026-08-10",
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: ymdHours(weekdayDatesAugust2026().filter((d) => d <= "2026-08-10")),
      leaves: [],
    });
    assert.equal(r.calendarDays, 10);
    assert.equal(r.payableDays, 10);
  });

  it("excludes leave after the run date", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 20,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: ymdHours(weekdayDatesAugust2026().filter((d) => d <= "2026-08-20")),
      leaves: [
        {
          start_date: "2026-08-24",
          end_date: "2026-08-24",
          total_days: 1,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
        },
      ],
    });
    assert.equal(r.unpaidLeaveDays, 0);
    assert.equal(r.payableDays, 20);
  });

  it("pays a 30-day month in full when there is no unpaid leave", () => {
    const r = computePayableDays({
      year: 2026,
      month: 9,
      runDay: 30,
      employeeDivisionId: DIV_A,
      holidays: [],
      attendance: ymdHours(weekdayDatesInMonth(2026, 9)),
      leaves: [],
    });
    assert.equal(r.calendarDays, 30);
    assert.equal(r.payableDays, 30);
  });

  it("pays a leap-year February in full when attendance is complete", () => {
    const r = computePayableDays({
      year: 2024,
      month: 2,
      runDay: 29,
      employeeDivisionId: DIV_A,
      holidays: [],
      attendance: ymdHours(weekdayDatesInMonth(2024, 2)),
      leaves: [],
    });
    assert.equal(r.calendarDays, 29);
    assert.equal(r.payableDays, 29);
  });

  it("is idempotent: repeated calculation does not change payable days", () => {
    const args = {
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-10", "2026-08-13"]).concat([
        { work_date: "2026-08-13", grossHours: 6.28 },
      ]),
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          paid_days: 1,
          unpaid_days: 0,
          status: "approved" as const,
          is_paid_type: true,
          leave_type_code: "CL",
        },
        {
          start_date: "2026-08-13",
          end_date: "2026-08-13",
          total_days: 0.5,
          paid_days: 0.5,
          unpaid_days: 0,
          status: "approved" as const,
          is_paid_type: true,
          leave_type_code: "CL",
        },
      ],
    };
    const first = computePayableDays(args);
    const second = computePayableDays(args);
    assert.equal(first.payableDays, 31);
    assert.equal(second.payableDays, first.payableDays);
    assert.equal(second.unpaidLeaveDays, first.unpaidLeaveDays);
  });

  it("full-month override ignores leave and attendance", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 20,
      fullMonthOverride: true,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: [],
      leaves: [
        {
          start_date: "2026-08-10",
          end_date: "2026-08-10",
          total_days: 1,
          unpaid_days: 1,
          status: "approved",
          is_paid_type: false,
        },
      ],
    });
    assert.equal(r.payableDays, 31);
    assert.equal(r.unpaidLeaveDays, 0);
  });

  it("clips multi-day leave that crosses the month and run date", () => {
    const r = computePayableDays({
      year: 2026,
      month: 8,
      runDay: 31,
      employeeDivisionId: DIV_A,
      holidays: AUG_HOLIDAYS,
      attendance: gouravLikeAttendance(["2026-08-31"]),
      leaves: [
        {
          start_date: "2026-08-31",
          end_date: "2026-09-02",
          total_days: 3,
          unpaid_days: 3,
          status: "approved",
          is_paid_type: false,
        },
      ],
    });
    assert.equal(r.unpaidLeaveDays, 1);
    assert.equal(r.payableDays, 30);
  });
});

describe("stale comparison helpers", () => {
  it("detects stored vs live payable-day drift", () => {
    assert.equal(payableDaysDiffer(30.5, 31), true);
    assert.equal(payableDaysDiffer(31, 31), false);
    assert.equal(payableDaysDiffer(29.5, 29.5), false);
  });

  it("treats source updates after generation as later", () => {
    assert.equal(isoAfter("2026-09-08T00:00:00Z", "2026-09-07T07:36:08Z"), true);
    assert.equal(isoAfter("2026-08-14T04:25:38Z", "2026-09-07T07:36:08Z"), false);
  });
});
