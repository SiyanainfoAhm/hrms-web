/**
 * If the employee never punched lunch out / lunch in, assume a standard lunch deduction
 * so payroll and totals are not overstated.
 */
export const MANDATORY_LUNCH_MINUTES_WHEN_NO_LUNCH_PUNCH = 60;
/** Don't auto-assume a lunch deduction for very short shifts (prevents active time going to 0). */
export const MIN_GROSS_MINUTES_FOR_MANDATORY_LUNCH = 4 * 60;

export function effectiveLunchBreakMinutes(args: {
  recordedLunchMinutes: number;
  lunchCheckOutAt: string | null | undefined;
  lunchCheckInAt: string | null | undefined;
  /** First check-in to final check-out span in minutes (caps lunch so active time ≥ 0). */
  grossWorkMinutes: number;
}): number {
  let m = Math.min(24 * 60, Math.max(0, Math.round(args.recordedLunchMinutes)));
  const noLunchPunch =
    !(args.lunchCheckOutAt && String(args.lunchCheckOutAt).trim()) &&
    !(args.lunchCheckInAt && String(args.lunchCheckInAt).trim());
  if (
    noLunchPunch &&
    args.grossWorkMinutes >= MIN_GROSS_MINUTES_FOR_MANDATORY_LUNCH &&
    m < MANDATORY_LUNCH_MINUTES_WHEN_NO_LUNCH_PUNCH
  ) {
    m = MANDATORY_LUNCH_MINUTES_WHEN_NO_LUNCH_PUNCH;
  }
  return Math.min(m, Math.max(0, args.grossWorkMinutes));
}
