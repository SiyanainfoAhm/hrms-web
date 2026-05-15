import {
  asBreakSegments,
  breakMinutesForKind,
  type BreakSegment,
} from "@/lib/attendanceBreakUtils";

export const MIN_COMBINED_BREAK_MINUTES = 60;

function clampMinutes(n: number): number {
  return Math.min(24 * 60, Math.max(0, Math.round(Number(n) || 0)));
}

/**
 * Lunch break minutes for payroll — uses segment sums when available.
 */

export function effectiveLunchBreakMinutes(args: {
  recordedLunchMinutes: number;
  lunchCheckOutAt: string | null | undefined;
  lunchCheckInAt: string | null | undefined;
  lunchBreakSegments?: unknown;
  lunchBreakStartedAt?: string | null;
  nowIso?: string;
  /** First check-in to final check-out span in minutes. */
  grossWorkMinutes: number;
}): number {
  const segments: BreakSegment[] = args.lunchBreakSegments
    ? asBreakSegments(args.lunchBreakSegments)
    : [];
  const m = breakMinutesForKind({
    recordedMinutes: args.recordedLunchMinutes,
    segments,
    legacyOut: args.lunchCheckOutAt,
    legacyIn: args.lunchCheckInAt,
    runningStart: args.lunchBreakStartedAt,
    nowIso: args.nowIso ?? new Date().toISOString(),
  });
  return Math.min(m, Math.max(0, args.grossWorkMinutes));
}

/**
 * New policy:
 * Combine lunch + tea break.
 *
 * If lunch + tea < 60 minutes:
 *   Count break as 60 minutes.
 *
 * If lunch + tea >= 60 minutes:
 *   Count actual break time.
 *
 * We add the shortfall to lunchBreakMinutes so the existing DB/UI/payroll
 * can continue using lunch_break_minutes + tea_break_minutes.
 *
 * Actual JSON segments are not changed, so HR can still see real break punches.
 */
export function effectiveCombinedBreakBreakdown(args: {
  lunchMinutes: number;
  teaMinutes: number;
  grossWorkMinutes: number;
  minimumBreakMinutes?: number;
}): {
  lunchBreakMinutes: number;
  teaBreakMinutes: number;
  actualBreakMinutes: number;
  countedBreakMinutes: number;
  policyShortfallMinutes: number;
} {
  const lunch = clampMinutes(args.lunchMinutes);
  const tea = clampMinutes(args.teaMinutes);
  const gross = clampMinutes(args.grossWorkMinutes);
  const minimum = clampMinutes(args.minimumBreakMinutes ?? MIN_COMBINED_BREAK_MINUTES);

  const actualBreakMinutes = lunch + tea;

  const countedBreakMinutes = Math.min(
    gross,
    Math.max(minimum, actualBreakMinutes),
  );

  const policyShortfallMinutes = Math.max(
    0,
    countedBreakMinutes - actualBreakMinutes,
  );

  return {
    lunchBreakMinutes: lunch + policyShortfallMinutes,
    teaBreakMinutes: tea,
    actualBreakMinutes,
    countedBreakMinutes,
    policyShortfallMinutes,
  };
}