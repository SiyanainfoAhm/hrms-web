import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRecalcAudit,
  canOverwritePayroll,
  holidayAffectsEmployee,
  isFinalizedOrPaid,
  requiresRecalcReason,
  resolvePayrollLifecycleStatus,
  shouldMarkPayslipStale,
} from "./payrollStaleDetection";

describe("payroll lifecycle safety", () => {
  it("allows recalculation of generated payroll", () => {
    assert.equal(canOverwritePayroll("generated"), true);
    assert.equal(isFinalizedOrPaid("generated"), false);
  });

  it("allows approved payroll only with a reason", () => {
    assert.equal(canOverwritePayroll("approved"), true);
    assert.equal(requiresRecalcReason("approved"), true);
  });

  it("blocks overwrite of finalized or paid payroll", () => {
    assert.equal(canOverwritePayroll("finalized"), false);
    assert.equal(canOverwritePayroll("paid"), false);
    assert.equal(isFinalizedOrPaid("finalized"), true);
    assert.equal(isFinalizedOrPaid("paid"), true);
  });

  it("treats a locked period as finalized", () => {
    assert.equal(resolvePayrollLifecycleStatus({ periodLocked: true, payrollStatus: "generated" }), "finalized");
  });
});

describe("source-change targeting", () => {
  it("marks stale when HR changes leave after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T10:00:00.000Z",
      storedPayableDays: 30.5,
      livePayableDays: 30.5,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
  });

  it("marks stale when paid leave becomes unpaid (formula drift)", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-08-14T04:25:06.561Z",
      storedPayableDays: 31,
      livePayableDays: 30.5,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "formula");
  });

  it("does not mark an unrelated employee when another employee's leave changes", () => {
    const gouravStale = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-08-14T04:25:06.561Z",
      storedPayableDays: 30.5,
      livePayableDays: 30.5,
    });
    assert.equal(gouravStale.stale, false);
  });

  it("company-wide holiday affects every employee; division holiday only that division", () => {
    assert.equal(holidayAffectsEmployee({ holidayDivisionId: null, employeeDivisionId: "div-a" }), true);
    assert.equal(holidayAffectsEmployee({ holidayDivisionId: "div-a", employeeDivisionId: "div-a" }), true);
    assert.equal(holidayAffectsEmployee({ holidayDivisionId: "div-b", employeeDivisionId: "div-a" }), false);
  });

  it("preserves old and new breakdowns in audit records", () => {
    const audit = buildRecalcAudit({
      action: "confirmed",
      reason: "HR modified attendance/leave after payroll generation",
      actorUserId: "hr-1",
      oldBreakdown: { payableDays: 30.5 },
      newBreakdown: { payableDays: 31 },
      changedSourceRecords: [{ kind: "leave", id: "l1" }],
    });
    assert.equal(audit.action, "confirmed");
    assert.deepEqual(audit.oldBreakdown, { payableDays: 30.5 });
    assert.deepEqual(audit.newBreakdown, { payableDays: 31 });
  });

  it("marks stale when HR changes full-day leave to half-day after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T12:00:00.000Z",
      storedPayableDays: 30,
      livePayableDays: 30.5,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
  });

  it("marks stale when HR approves previously pending leave after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T09:00:00.000Z",
      storedPayableDays: 31,
      livePayableDays: 29.5,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
  });

  it("marks stale when HR cancels an approved leave after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T11:00:00.000Z",
      storedPayableDays: 29.5,
      livePayableDays: 31,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
  });

  it("marks stale when HR changes an employee's division after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T14:00:00.000Z",
      storedPayableDays: 31,
      livePayableDays: 31,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
  });

  it("marks stale when HR adds a division holiday after generation", () => {
    const r = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T15:00:00.000Z",
      storedPayableDays: 31,
      livePayableDays: 31,
    });
    assert.equal(r.stale, true);
    assert.equal(r.reason, "source");
    assert.equal(holidayAffectsEmployee({ holidayDivisionId: "div-a", employeeDivisionId: "div-a" }), true);
    assert.equal(holidayAffectsEmployee({ holidayDivisionId: "div-a", employeeDivisionId: "div-b" }), false);
  });

  it("does not allow finalized payroll to be overwritten even when live values differ", () => {
    assert.equal(canOverwritePayroll("finalized"), false);
    assert.equal(canOverwritePayroll("paid"), false);
    const stale = shouldMarkPayslipStale({
      generatedAtIso: "2026-09-07T07:36:08.186Z",
      sourceChangedAtIso: "2026-09-08T10:00:00.000Z",
      storedPayableDays: 30.5,
      livePayableDays: 31,
    });
    assert.equal(stale.stale, true);
  });
});
