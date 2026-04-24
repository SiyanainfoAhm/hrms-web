export function effectiveLunchBreakMinutes(args: {
  recordedLunchMinutes: number;
  lunchCheckOutAt: string | null | undefined;
  lunchCheckInAt: string | null | undefined;
  /** First check-in to final check-out span in minutes (caps lunch so active time ≥ 0). */
  grossWorkMinutes: number;
}): number {
  // Lunch should be deducted only when it is actually recorded (minutes or punches).
  // If employee did not take lunch, they won't punch lunch and lunch minutes stay 0.
  const m = Math.min(24 * 60, Math.max(0, Math.round(args.recordedLunchMinutes)));
  return Math.min(m, Math.max(0, args.grossWorkMinutes));
}
