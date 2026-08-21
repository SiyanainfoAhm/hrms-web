import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const IST_TZ = "Asia/Kolkata" as const;
export const US_EASTERN_TZ = "America/New_York" as const;

export type AttendanceTimeZoneId = typeof IST_TZ | typeof US_EASTERN_TZ;

function parseTime24ToMinutes(value: string): number | null {
  const v = value.trim();
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function timeZoneLabel(tz: AttendanceTimeZoneId): string {
  return tz === US_EASTERN_TZ ? "US/Eastern" : "IST";
}

export function ymdInTimeZone(d: Date, tz: AttendanceTimeZoneId): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/**
 * Convert a calendar day (YYYY-MM-DD) in `tz` to an inclusive UTC timestamptz
 * range. Use for filtering `timestamptz` columns (e.g. captured_at).
 *
 * Do not use `new Date("YYYY-MM-DD")` — that parses as UTC midnight and shifts
 * IST days by −5:30.
 *
 * Example (IST):
 *   2026-08-17 → [2026-08-16T18:30:00.000Z, 2026-08-17T18:30:00.000Z)
 */
export function ymdDayUtcRange(
  ymd: string,
  tz: AttendanceTimeZoneId = IST_TZ,
): { startUtcIso: string; endUtcIsoExclusive: string } {
  const day = String(ymd).slice(0, 10);
  const start = fromZonedTime(`${day}T00:00:00`, tz);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startUtcIso: start.toISOString(),
    endUtcIsoExclusive: endExclusive.toISOString(),
  };
}

export function hmMinutesInTimeZone(d: Date, tz: AttendanceTimeZoneId): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

export function computeWorkDateForNow(args: {
  now: Date;
  tz: AttendanceTimeZoneId;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  isNightShift: boolean;
}): string {
  const today = ymdInTimeZone(args.now, args.tz);
  if (!args.isNightShift) return today;

  const endMin = args.shiftEndTime ? parseTime24ToMinutes(args.shiftEndTime) : null;
  if (endMin == null) {
    // Default for night shifts: anything after midnight but before 06:00 belongs to previous work date.
    const nowMin = hmMinutesInTimeZone(args.now, args.tz);
    if (nowMin < 6 * 60) return ymdInTimeZone(new Date(args.now.getTime() - 86400000), args.tz);
    return today;
  }

  const nowMin = hmMinutesInTimeZone(args.now, args.tz);
  // Night shift spans midnight, so early-morning minutes belong to previous work_date (the shift start date).
  if (nowMin < endMin) return ymdInTimeZone(new Date(args.now.getTime() - 86400000), args.tz);
  return today;
}

export async function getAttendanceContextForUser(args: {
  supabase: SupabaseClient;
  companyId: string;
  attendanceEmployeeId: string;
}): Promise<{
  timeZone: AttendanceTimeZoneId;
  isNightShift: boolean;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
}> {
  const { data: emp, error: empErr } = await args.supabase
    .from("HRMS_employees")
    .select("shift_id")
    .eq("company_id", args.companyId)
    .eq("id", args.attendanceEmployeeId)
    .maybeSingle();
  if (empErr) throw empErr;

  const shiftId = (emp as any)?.shift_id ? String((emp as any).shift_id) : "";
  if (!shiftId) {
    return { timeZone: IST_TZ, isNightShift: false, shiftStartTime: null, shiftEndTime: null };
  }

  const { data: shift, error: shErr } = await args.supabase
    .from("HRMS_shifts")
    .select("is_night_shift, start_time, end_time")
    .eq("company_id", args.companyId)
    .eq("id", shiftId)
    .maybeSingle();
  if (shErr) throw shErr;

  const isNightShift = Boolean((shift as any)?.is_night_shift);
  const timeZone: AttendanceTimeZoneId = isNightShift ? US_EASTERN_TZ : IST_TZ;
  return {
    timeZone,
    isNightShift,
    shiftStartTime: (shift as any)?.start_time ? String((shift as any).start_time) : null,
    shiftEndTime: (shift as any)?.end_time ? String((shift as any).end_time) : null,
  };
}

