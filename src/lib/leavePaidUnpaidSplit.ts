import {
  asOfYmdForLeaveEntitlementBooking,
  computeEntitled,
  computeUsedDaysForYear,
  leaveYearStart,
  type ApprovedLeave,
  type LeavePolicy,
} from "@/lib/leavePolicy";

export type LeavePolicyRow = {
  accrual_method: string;
  monthly_accrual_rate: number | null;
  annual_quota: number | null;
  prorate_on_join: boolean;
  reset_month: number | null;
  reset_day: number | null;
  allow_carryover: boolean | null;
  carryover_limit: number | null;
};

export function leavePolicyFromRow(leaveTypeId: string, pRaw: LeavePolicyRow | null | undefined): LeavePolicy | null {
  if (!pRaw) return null;
  return {
    leave_type_id: leaveTypeId,
    accrual_method: pRaw.accrual_method as LeavePolicy["accrual_method"],
    monthly_accrual_rate: pRaw.monthly_accrual_rate,
    annual_quota: pRaw.annual_quota,
    prorate_on_join: Boolean(pRaw.prorate_on_join),
    reset_month: Number(pRaw.reset_month ?? 1),
    reset_day: Number(pRaw.reset_day ?? 1),
    allow_carryover: Boolean(pRaw.allow_carryover),
    carryover_limit: pRaw.carryover_limit,
  };
}

export function computeLeavePaidUnpaidSplit(args: {
  totalDays: number;
  startDateYmd: string;
  leaveTypeId: string;
  isPaidLeaveType: boolean;
  policy: LeavePolicy | null;
  joinDateYmd: string | null;
  todayYmd: string;
  approvedLeaves: ApprovedLeave[];
}): {
  paidDays: number;
  unpaidDays: number;
  entitled: number | null;
  usedBeforeBooking: number;
  remainingBeforeBooking: number | null;
  asOfYmd: string;
} {
  const { totalDays, startDateYmd, leaveTypeId, isPaidLeaveType, policy, joinDateYmd, todayYmd, approvedLeaves } =
    args;
  const totalSafe = Math.max(0, Number(totalDays) || 0);

  if (!isPaidLeaveType) {
    return {
      paidDays: 0,
      unpaidDays: totalSafe,
      entitled: null,
      usedBeforeBooking: 0,
      remainingBeforeBooking: null,
      asOfYmd: todayYmd,
    };
  }

  if (!policy) {
    return {
      paidDays: totalSafe,
      unpaidDays: 0,
      entitled: null,
      usedBeforeBooking: 0,
      remainingBeforeBooking: null,
      asOfYmd: todayYmd,
    };
  }

  const asOfYmd = asOfYmdForLeaveEntitlementBooking(startDateYmd, todayYmd);
  const asOf = new Date(asOfYmd + "T00:00:00Z");
  const joinDate = joinDateYmd ? new Date(joinDateYmd + "T00:00:00Z") : null;
  const yearStart = leaveYearStart(asOf, policy.reset_month, policy.reset_day);
  const yearEndExclusive = new Date(
    Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), yearStart.getUTCDate(), 0, 0, 0, 0),
  );

  const entitled = computeEntitled(policy, joinDate, asOf);
  const usedBeforeBooking = computeUsedDaysForYear(approvedLeaves, leaveTypeId, yearStart, yearEndExclusive);
  const remainingBeforeBooking = entitled == null ? null : Math.max(0, entitled - usedBeforeBooking);
  const paidDays =
    remainingBeforeBooking == null ? totalSafe : Math.min(totalSafe, remainingBeforeBooking);
  const unpaidDays = totalSafe - paidDays;

  return {
    paidDays,
    unpaidDays,
    entitled,
    usedBeforeBooking,
    remainingBeforeBooking,
    asOfYmd,
  };
}
