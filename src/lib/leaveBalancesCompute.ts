import {
  computeEntitled,
  computeUsedDaysForYear,
  leaveYearStart,
  type ApprovedLeave,
  type LeavePolicy,
} from "@/lib/leavePolicy";

export type LeavePolicyWithTypeRow = {
  leave_type_id: string;
  accrual_method: string;
  monthly_accrual_rate: number | null;
  annual_quota: number | null;
  prorate_on_join: boolean;
  reset_month: number | null;
  reset_day: number | null;
  allow_carryover: boolean | null;
  carryover_limit: number | null;
  HRMS_leave_types?: { name?: string; is_paid?: boolean; code?: string | null; payslip_slot?: string | null } | null;
};

export type LeaveBalanceComputedRow = {
  leaveTypeId: string;
  leaveTypeName: string;
  payslipSlot: string | null;
  isPaid: boolean;
  entitled: number | null;
  used: number;
  remaining: number | null;
};

export function computeLeaveBalanceRows(
  policies: LeavePolicyWithTypeRow[],
  approvedLeaves: ApprovedLeave[],
  joinDateStr: string | null,
  asOfYmd: string,
): LeaveBalanceComputedRow[] {
  const asOf = new Date(asOfYmd + "T00:00:00Z");
  const joinDate = joinDateStr ? new Date(joinDateStr + "T00:00:00Z") : null;

  return (policies ?? []).map((p) => {
    const policy: LeavePolicy = {
      leave_type_id: p.leave_type_id,
      accrual_method: p.accrual_method as LeavePolicy["accrual_method"],
      monthly_accrual_rate: p.monthly_accrual_rate,
      annual_quota: p.annual_quota,
      prorate_on_join: Boolean(p.prorate_on_join),
      reset_month: Number(p.reset_month ?? 1),
      reset_day: Number(p.reset_day ?? 1),
      allow_carryover: Boolean(p.allow_carryover),
      carryover_limit: p.carryover_limit,
    };

    const yearStart = leaveYearStart(asOf, policy.reset_month, policy.reset_day);
    const yearEndExclusive = new Date(
      Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), yearStart.getUTCDate(), 0, 0, 0, 0),
    );

    const entitled = computeEntitled(policy, joinDate, asOf);
    const used = computeUsedDaysForYear(approvedLeaves, p.leave_type_id, yearStart, yearEndExclusive);
    const remaining = entitled == null ? null : Math.max(0, entitled - used);

    return {
      leaveTypeId: p.leave_type_id,
      leaveTypeName: p.HRMS_leave_types?.name ?? "",
      payslipSlot: (p.HRMS_leave_types?.payslip_slot as string | null) ?? null,
      isPaid: Boolean(p.HRMS_leave_types?.is_paid),
      entitled,
      used,
      remaining,
    };
  });
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
