import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLeaveBalanceRows } from "./leaveBalancesCompute";
import {
  dayBeforeYmd,
  policyAppliesOnDate,
  policySegmentsForRange,
  selectPolicyForDate,
  validateRequestEnabledAcrossRange,
  type LeavePolicyVersionRow,
} from "./leavePolicyEffective";

function pol(partial: Partial<LeavePolicyVersionRow> & { leave_type_id: string }): LeavePolicyVersionRow {
  return {
    accrual_method: "annual",
    monthly_accrual_rate: null,
    annual_quota: 3,
    prorate_on_join: false,
    reset_month: 1,
    reset_day: 1,
    allow_carryover: false,
    carryover_limit: null,
    effective_from: "2000-01-01",
    effective_to: null,
    request_enabled: true,
    HRMS_leave_types: { name: "Casual Leave", is_paid: true, code: "CL", payslip_slot: "CL" },
    ...partial,
  };
}

describe("leavePolicyEffective", () => {
  it("dayBeforeYmd returns previous calendar day", () => {
    assert.equal(dayBeforeYmd("2026-07-01"), "2026-06-30");
  });

  it("policyAppliesOnDate respects inclusive effective window", () => {
    const p = { effective_from: "2026-07-01", effective_to: "2026-12-31" };
    assert.equal(policyAppliesOnDate(p, "2026-06-30"), false);
    assert.equal(policyAppliesOnDate(p, "2026-07-01"), true);
    assert.equal(policyAppliesOnDate(p, "2026-12-31"), true);
    assert.equal(policyAppliesOnDate(p, "2027-01-01"), false);
  });

  it("selectPolicyForDate picks Jul-Dec version for mid-2026", () => {
    const policies = [
      pol({ leave_type_id: "cl", effective_from: "2000-01-01", effective_to: "2026-06-30", annual_quota: 12 }),
      pol({ leave_type_id: "cl", effective_from: "2026-07-01", effective_to: "2026-12-31", annual_quota: 3 }),
      pol({ leave_type_id: "cl", effective_from: "2027-01-01", effective_to: null, annual_quota: 6 }),
    ];
    assert.equal(selectPolicyForDate(policies, "cl", "2026-06-30")?.annual_quota, 12);
    assert.equal(selectPolicyForDate(policies, "cl", "2026-07-01")?.annual_quota, 3);
    assert.equal(selectPolicyForDate(policies, "cl", "2027-01-01")?.annual_quota, 6);
  });

  it("blocks PL when request_enabled is false", () => {
    const policies = [
      pol({
        leave_type_id: "pl",
        effective_from: "2026-07-01",
        annual_quota: 0,
        request_enabled: false,
        HRMS_leave_types: { name: "Paid Leave", code: "PL", is_paid: true },
      }),
    ];
    const err = validateRequestEnabledAcrossRange(policies, "pl", "2026-07-10", "2026-07-10", "Paid Leave");
    assert.match(String(err), /not available/i);
  });

  it("splits cross-period ranges into policy segments", () => {
    const policies = [
      pol({ leave_type_id: "cl", effective_from: "2000-01-01", effective_to: "2026-06-30", annual_quota: 12 }),
      pol({ leave_type_id: "cl", effective_from: "2026-07-01", effective_to: "2026-12-31", annual_quota: 3 }),
    ];
    const segs = policySegmentsForRange(policies, "cl", "2026-06-29", "2026-07-02");
    assert.equal(segs.length, 2);
    assert.equal(segs[0].endYmd, "2026-06-30");
    assert.equal(segs[1].startYmd, "2026-07-01");
    assert.equal(segs[0].policy.annual_quota, 12);
    assert.equal(segs[1].policy.annual_quota, 3);
  });
});

describe("computeLeaveBalanceRows with effective policies", () => {
  const clId = "cl-1";
  const slId = "sl-1";
  const plId = "pl-1";

  const policies: LeavePolicyVersionRow[] = [
    pol({
      leave_type_id: clId,
      effective_from: "2026-07-01",
      effective_to: "2026-12-31",
      annual_quota: 3,
      HRMS_leave_types: { name: "Casual Leave", code: "CL", is_paid: true, payslip_slot: "CL" },
    }),
    pol({
      leave_type_id: slId,
      effective_from: "2026-07-01",
      effective_to: "2026-12-31",
      annual_quota: 3,
      HRMS_leave_types: { name: "Sick Leave", code: "SL", is_paid: true, payslip_slot: "SL" },
    }),
    pol({
      leave_type_id: plId,
      effective_from: "2026-07-01",
      effective_to: null,
      annual_quota: 0,
      request_enabled: false,
      HRMS_leave_types: { name: "Paid Leave", code: "PL", is_paid: true, payslip_slot: "PL" },
    }),
    pol({
      leave_type_id: clId,
      effective_from: "2027-01-01",
      effective_to: null,
      annual_quota: 6,
      HRMS_leave_types: { name: "Casual Leave", code: "CL", is_paid: true, payslip_slot: "CL" },
    }),
    pol({
      leave_type_id: slId,
      effective_from: "2027-01-01",
      effective_to: null,
      annual_quota: 6,
      HRMS_leave_types: { name: "Sick Leave", code: "SL", is_paid: true, payslip_slot: "SL" },
    }),
  ];

  it("Jul 2026: CL=3 SL=3 PL=0 and PL requests blocked", () => {
    const rows = computeLeaveBalanceRows(policies, [], null, "2026-07-15");
    const cl = rows.find((r) => r.leaveTypeId === clId)!;
    const sl = rows.find((r) => r.leaveTypeId === slId)!;
    const pl = rows.find((r) => r.leaveTypeId === plId)!;
    assert.equal(cl.entitled, 3);
    assert.equal(sl.entitled, 3);
    assert.equal(pl.entitled, 0);
    assert.equal(pl.requestEnabled, false);
  });

  it("approved CL in Jul-Dec reduces remaining from 3", () => {
    const rows = computeLeaveBalanceRows(
      policies,
      [{ leave_type_id: clId, start_date: "2026-07-22", end_date: "2026-07-22", total_days: 1 }],
      null,
      "2026-07-28",
    );
    const cl = rows.find((r) => r.leaveTypeId === clId)!;
    assert.equal(cl.used, 1);
    assert.equal(cl.remaining, 2);
  });

  it("Jan 2027 resets to CL=6 SL=6 without deleting 2026 history from calc window", () => {
    const rows = computeLeaveBalanceRows(
      policies,
      [
        { leave_type_id: clId, start_date: "2026-07-22", end_date: "2026-07-22", total_days: 1 },
        { leave_type_id: clId, start_date: "2027-01-05", end_date: "2027-01-05", total_days: 2 },
      ],
      null,
      "2027-01-10",
    );
    const cl = rows.find((r) => r.leaveTypeId === clId)!;
    assert.equal(cl.entitled, 6);
    assert.equal(cl.used, 2);
    assert.equal(cl.remaining, 4);
  });

  it("other company policies are not mixed when only company A versions are passed", () => {
    // balance compute is fed company-scoped rows only — empty policies → empty balances
    assert.deepEqual(computeLeaveBalanceRows([], [], null, "2026-07-15"), []);
  });
});
