import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFICE_LEAVE_ACTIVE_MINUTES,
  OFFICE_LEAVE_BREAK_MINUTES,
  OFFICE_LEAVE_GROSS_MINUTES,
  isOfficeLeaveTypeCode,
  officeLeaveAttendancePatch,
  officeLeaveMetrics,
  officeLeavePresentDatesInWindow,
  officeLeaveWorkDatesInRange,
} from "./officeLeaveAttendance";

describe("officeLeaveAttendance", () => {
  it("recognises Office Leave type code OL", () => {
    assert.equal(isOfficeLeaveTypeCode("OL"), true);
    assert.equal(isOfficeLeaveTypeCode("ol"), true);
    assert.equal(isOfficeLeaveTypeCode("PL"), false);
  });

  it("creates attendance with 540 gross, 480 active, 60 break minutes", () => {
    const patch = officeLeaveAttendancePatch({
      workDateYmd: "2026-07-07",
      leaveRequestId: "leave-1",
      attachmentUrl: "https://example.com/proof.pdf",
    });
    const metrics = officeLeaveMetrics();
    assert.equal(OFFICE_LEAVE_GROSS_MINUTES, 540);
    assert.equal(OFFICE_LEAVE_ACTIVE_MINUTES, 480);
    assert.equal(OFFICE_LEAVE_BREAK_MINUTES, 60);
    assert.equal(patch.total_hours, 9);
    assert.equal(patch.lunch_break_minutes, 60);
    assert.equal(patch.agent_active_minutes, 480);
    assert.equal(patch.agent_idle_minutes, 60);
    assert.equal(patch.is_office_leave, true);
    assert.deepEqual(patch.lunch_break_segments, []);
    assert.deepEqual(patch.tea_break_segments, []);
    assert.equal(patch.notes, "Approved Office Leave");
    assert.equal(metrics.grossMinutes, 540);
    assert.equal(metrics.activeMinutes, 480);
    assert.equal(metrics.idleMinutes, 60);
  });

  it("includes a weekday working day in range", () => {
    const dates = officeLeaveWorkDatesInRange({
      startYmd: "2026-07-07",
      endYmd: "2026-07-07",
      holidays: [],
      employeeDivisionId: null,
    });
    assert.deepEqual(dates, ["2026-07-07"]);
  });

  it("excludes weekends from Office Leave work dates", () => {
    const dates = officeLeaveWorkDatesInRange({
      startYmd: "2026-07-04",
      endYmd: "2026-07-05",
      holidays: [],
      employeeDivisionId: null,
    });
    assert.deepEqual(dates, []);
  });

  it("excludes applicable holidays from Office Leave work dates", () => {
    const dates = officeLeaveWorkDatesInRange({
      startYmd: "2026-07-07",
      endYmd: "2026-07-07",
      holidays: [{ holiday_date: "2026-07-07", division_id: null }],
      employeeDivisionId: "div-1",
    });
    assert.deepEqual(dates, []);
  });

  it("creates one working day per date in a multi-day Office Leave range", () => {
    const dates = officeLeaveWorkDatesInRange({
      startYmd: "2026-07-06",
      endYmd: "2026-07-10",
      holidays: [],
      employeeDivisionId: null,
    });
    assert.deepEqual(dates, ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]);
  });

  it("credits payroll-present dates for approved Office Leave in window", () => {
    const dates = officeLeavePresentDatesInWindow({
      startYmd: "2026-07-01",
      endYmd: "2026-07-31",
      leaveStartYmd: "2026-07-07",
      leaveEndYmd: "2026-07-07",
      holidays: [],
      employeeDivisionId: null,
    });
    assert.deepEqual(dates, ["2026-07-07"]);
  });

  it("does not double-count Shashank Sharma verification date when already in window logic", () => {
    const dates = officeLeavePresentDatesInWindow({
      startYmd: "2026-07-01",
      endYmd: "2026-07-31",
      leaveStartYmd: "2026-07-07",
      leaveEndYmd: "2026-07-07",
      holidays: [],
      employeeDivisionId: null,
    });
    assert.equal(dates.length, 1);
    assert.equal(dates[0], "2026-07-07");
  });
});
