import {
  asOfYmdForLeaveEntitlementBooking,
  leaveUnitsInWindow,
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
  policySegmentsForRange,
  toLeavePolicy,
  type LeavePolicyVersionRow,
  validateRequestEnabledAcrossRange,
} from "@/lib/leavePolicyEffective";

export type LeavePolicyRow = {
  accrual_method: string;
  monthly_accrual_rate: number | null;
  annual_quota: number | null;
  prorate_on_join: boolean;
  reset_month: number | null;
  reset_day: number | null;
  allow_carryover: boolean | null;
  carryover_limit: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  request_enabled?: boolean | null;
};

export function leavePolicyFromRow(
  leaveTypeId: string,
  pRaw: LeavePolicyRow | LeavePolicyVersionRow | null | undefined,
): LeavePolicy | null {
  if (!pRaw) return null;
  return toLeavePolicy({
    leave_type_id: leaveTypeId,
    ...pRaw,
  });
}

export { validateRequestEnabledAcrossRange };

export function computeLeavePaidUnpaidSplit(args: {
  totalDays: number;
  startDateYmd: string;
  endDateYmd?: string;
  leaveTypeId: string;
  isPaidLeaveType: boolean;
  policy: LeavePolicy | null;
  /** All versions for this leave type (company-scoped). Enables cross-period splitting. */
  policyVersions?: LeavePolicyVersionRow[] | null;
  joinDateYmd: string | null;
  todayYmd: string;
  approvedLeaves: ApprovedLeave[];
  adjustments?: LeaveBalanceAdjustment[];
}): {
  paidDays: number;
  unpaidDays: number;
  entitled: number | null;
  usedBeforeBooking: number;
  remainingBeforeBooking: number | null;
  asOfYmd: string;
} {
  const {
    totalDays,
    startDateYmd,
    endDateYmd,
    leaveTypeId,
    isPaidLeaveType,
    policy,
    policyVersions,
    joinDateYmd,
    todayYmd,
    approvedLeaves,
    adjustments,
  } = args;
  const totalSafe = Math.max(0, Number(totalDays) || 0);
  const endYmd = (endDateYmd || startDateYmd).slice(0, 10);

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

  if (policyVersions && policyVersions.length > 0) {
    const segments = policySegmentsForRange(policyVersions, leaveTypeId, startDateYmd, endYmd);
    if (segments.length > 0) {
      let paidDays = 0;
      let entitledSum = 0;
      let usedSum = 0;
      let hasFinite = false;
      const joinDate = joinDateYmd ? new Date(joinDateYmd + "T00:00:00Z") : null;
      const asOfYmd = asOfYmdForLeaveEntitlementBooking(startDateYmd, todayYmd);

      for (const seg of segments) {
        const segEndExclusive = (() => {
          const d = new Date(seg.endYmd + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          return d;
        })();
        const spanUnits = leaveUnitsInWindow(
          startDateYmd,
          endYmd,
          totalSafe,
          new Date(seg.startYmd + "T00:00:00Z"),
          segEndExclusive,
        ).unitsInWindow;

        const asOf = new Date(
          asOfYmdForLeaveEntitlementBooking(seg.startYmd, todayYmd) + "T00:00:00Z",
        );
        const entitled = computeEntitledForPolicyPeriod(seg.policy, joinDate, asOf);
        const usedBeforeBooking = computeUsedDaysForPolicyPeriod(
          approvedLeaves,
          leaveTypeId,
          seg.policy,
          asOf,
        );
        const adjustmentOffset = sumAdjustmentDays(adjustments ?? [], leaveTypeId, asOfYmd);
        const remaining =
          entitled == null ? null : Math.max(0, entitled - usedBeforeBooking + adjustmentOffset);
        const paidSeg = remaining == null ? spanUnits : Math.min(spanUnits, remaining);
        paidDays += paidSeg;
        if (entitled != null) {
          hasFinite = true;
          entitledSum += entitled;
          usedSum += usedBeforeBooking;
        }
      }

      const adjustmentOffset = sumAdjustmentDays(adjustments ?? [], leaveTypeId, asOfYmd);
      const paidClamped = Math.min(totalSafe, Math.round(paidDays * 1000) / 1000);
      return {
        paidDays: paidClamped,
        unpaidDays: Math.max(0, totalSafe - paidClamped),
        entitled: hasFinite ? entitledSum : null,
        usedBeforeBooking: usedSum,
        remainingBeforeBooking: hasFinite ? Math.max(0, entitledSum - usedSum + adjustmentOffset) : null,
        asOfYmd,
      };
    }
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

  const entitled = computeEntitledForPolicyPeriod(policy, joinDate, asOf);
  const usedBeforeBooking = computeUsedDaysForPolicyPeriod(approvedLeaves, leaveTypeId, policy, asOf);
  const adjustmentOffset = sumAdjustmentDays(adjustments ?? [], leaveTypeId, asOfYmd);
  const remainingBeforeBooking =
    entitled == null ? null : Math.max(0, entitled - usedBeforeBooking + adjustmentOffset);
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
