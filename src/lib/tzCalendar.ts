import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type CalendarTz = "Asia/Kolkata" | "America/New_York";

/** Today as YYYY-MM-DD in `tz`. */
export function todayYmdTz(tz: CalendarTz): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** Parse YMD as noon in `tz` (stable for DayPicker + DST). */
export function ymdToNoonTz(ymd: string, tz: CalendarTz): Date {
  // fromZonedTime interprets the given date as local time in `tz` and returns a UTC Date.
  return fromZonedTime(new Date(`${String(ymd).slice(0, 10)}T12:00:00`), tz);
}

/** Format any Date to YYYY-MM-DD in `tz`. */
export function dateToYmdTz(d: Date, tz: CalendarTz): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

export function addDaysTz(ymd: string, deltaDays: number, tz: CalendarTz): string {
  const d = ymdToNoonTz(ymd, tz);
  d.setTime(d.getTime() + deltaDays * 86400000);
  return dateToYmdTz(d, tz);
}

/** Monday–Sunday week in `tz` containing `ymd`. */
export function thisWeekRangeTz(ymd: string, tz: CalendarTz): { start: string; end: string } {
  const d = ymdToNoonTz(ymd, tz);
  const wdStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const key = wdStr.slice(0, 3);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = map[key] ?? 0;
  const deltaToMonday = wd === 0 ? -6 : 1 - wd;
  const start = addDaysTz(ymd, deltaToMonday, tz);
  const end = addDaysTz(start, 6, tz);
  return { start, end };
}

export function lastWeekRangeTz(ymd: string, tz: CalendarTz): { start: string; end: string } {
  const { start: thisMon } = thisWeekRangeTz(ymd, tz);
  const start = addDaysTz(thisMon, -7, tz);
  const end = addDaysTz(start, 6, tz);
  return { start, end };
}

export function thisMonthRangeTz(ymd: string): { start: string; end: string } {
  const [y, mo] = String(ymd).slice(0, 10).split("-").map(Number);
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function lastMonthRangeTz(ymd: string): { start: string; end: string } {
  const [y, mo] = String(ymd).slice(0, 10).split("-").map(Number);
  let m = mo - 1;
  let yy = y;
  if (m < 1) {
    m = 12;
    yy -= 1;
  }
  const lastDay = new Date(yy, m, 0).getDate();
  return {
    start: `${yy}-${String(m).padStart(2, "0")}-01`,
    end: `${yy}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

