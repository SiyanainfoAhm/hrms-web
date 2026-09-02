import {
  type ApprovedLeave,
  type LeavePolicy,
} from "@/lib/leavePolicy";
import {
  type LeaveBalanceAdjustment,
  sumAdjustmentDays,
} from "@/lib/leaveBalanceAdjustments";
import {
  computeEntitledForPolicyPeriod,
  computeUsedDaysForPolicyPeriod,
  policyEntitlementWindow,
  selectCurrentPolicies,
  selectPolicyForDate,
  toLeavePolicy,
  type LeavePolicyVersionRow,
} from "@/lib/leavePolicyEffective";

export type LeavePolicyWithTypeRow = LeavePolicyVersionRow;

export type LeaveBalanceComputedRow = {
  leaveTypeId: string;
  leaveTypeName: string;
  payslipSlot: string | null;
  isPaid: boolean;
  entitled: number | null;
  used: number;
  /** Sum of manual HR adjustments effective on asOf date. */
  adjustmentOffset: number;
  remaining: number | null;
  requestEnabled: boolean;
  periodStart: string;
  periodEndInclusive: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function computeLeaveBalanceRows(
  policies: LeavePolicyWithTypeRow[],
  approvedLeaves: ApprovedLeave[],
  joinDateStr: string | null,
  asOfYmd: string,
  adjustments?: LeaveBalanceAdjustment[],
): LeaveBalanceComputedRow[] {
  const asOf = new Date(asOfYmd + "T00:00:00Z");
  const joinDate = joinDateStr ? new Date(joinDateStr + "T00:00:00Z") : null;

  // One balance row per leave type using the version in force on asOf.
  const current = selectCurrentPolicies(policies ?? [], asOfYmd);

  return current.map((p) => {
    const policy: LeavePolicy = toLeavePolicy(p);
    const { start, endExclusive } = policyEntitlementWindow(policy, asOf);
    const entitled = computeEntitledForPolicyPeriod(policy, joinDate, asOf);
    const used = computeUsedDaysForPolicyPeriod(approvedLeaves, p.leave_type_id, policy, asOf);
    const adjustmentOffset = sumAdjustmentDays(adjustments ?? [], p.leave_type_id, asOfYmd);
    const remaining =
      entitled == null ? null : Math.max(0, entitled - used + adjustmentOffset);
    const periodEndInclusive = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return {
      leaveTypeId: p.leave_type_id,
      leaveTypeName: p.HRMS_leave_types?.name ?? "",
      payslipSlot: (p.HRMS_leave_types?.payslip_slot as string | null) ?? null,
      isPaid: Boolean(p.HRMS_leave_types?.is_paid),
      entitled,
      used,
      adjustmentOffset,
      remaining,
      requestEnabled: policy.request_enabled !== false,
      periodStart: start.toISOString().slice(0, 10),
      periodEndInclusive,
      effectiveFrom: policy.effective_from || "2000-01-01",
      effectiveTo: policy.effective_to ?? null,
    };
  });
}

/** Resolve the single policy version for a type on a date (for booking). */
export function resolvePolicyRowForDate(
  policies: LeavePolicyWithTypeRow[],
  leaveTypeId: string,
  ymd: string,
): LeavePolicyWithTypeRow | null {
  return selectPolicyForDate(policies, leaveTypeId, ymd);
}

export type GovernmentLeavePayslipDisplay = {
  leaveBalanceTotal: string;
  casualLeave: string;
  earnedLeave: string;
  hpl: string;
  hl: string;
};

function fmtLeaveNum(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** Sum remaining days shown on government payslip (CL + EL + HPL + HL slots). */
export function formatGovernmentLeavePayslipDisplay(rows: LeaveBalanceComputedRow[]): GovernmentLeavePayslipDisplay {
  const bySlot = (slot: string) => rows.find((x) => x.payslipSlot === slot)?.remaining ?? null;
  const cl = bySlot("CL");
  const el = bySlot("EL");
  const hpl = bySlot("HPL");
  const hl = bySlot("HL");
  const nums = [cl, el, hpl, hl].filter((x): x is number => x != null && Number.isFinite(x));
  const total = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  return {
    leaveBalanceTotal: fmtLeaveNum(total),
    casualLeave: fmtLeaveNum(cl),
    earnedLeave: fmtLeaveNum(el),
    hpl: fmtLeaveNum(hpl),
    hl: fmtLeaveNum(hl),
  };
}

export function slipBalanceAsOfYmd(periodEnd: string, periodStart: string, generatedAt: string): string {
  const pe = periodEnd?.slice(0, 10);
  if (pe && /^\d{4}-\d{2}-\d{2}$/.test(pe)) return pe;
  const ym = periodStart?.slice(0, 7);
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  const g = generatedAt?.slice(0, 10);
  return g && /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : new Date().toISOString().slice(0, 10);
}
