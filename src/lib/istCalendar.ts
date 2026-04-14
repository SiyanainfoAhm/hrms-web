import { formatInTimeZone } from "date-fns-tz";

const TZ = "Asia/Kolkata";

/** Today as YYYY-MM-DD in Asia/Kolkata. */
export function istTodayYmd(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

/** Parse YMD as noon IST for stable calendar math. */
export function ymdToNoonIST(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+05:30`);
}

export function addDaysIST(ymd: string, delta: number): string {
  const d = ymdToNoonIST(ymd);
  d.setTime(d.getTime() + delta * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Monday–Sunday week in IST containing `ymd`. */
export function thisWeekRangeIST(ymd: string): { start: string; end: string } {
  const d = ymdToNoonIST(ymd);
  const wdStr = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const key = wdStr.slice(0, 3);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = map[key] ?? 0;
  const deltaToMonday = wd === 0 ? -6 : 1 - wd;
  const start = addDaysIST(ymd, deltaToMonday);
  const end = addDaysIST(start, 6);
  return { start, end };
}

export function lastWeekRangeIST(ymd: string): { start: string; end: string } {
  const { start: thisMon } = thisWeekRangeIST(ymd);
  const start = addDaysIST(thisMon, -7);
  const end = addDaysIST(start, 6);
  return { start, end };
}

export function thisMonthRangeIST(ymd: string): { start: string; end: string } {
  const [y, mo] = ymd.split("-").map(Number);
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function lastMonthRangeIST(ymd: string): { start: string; end: string } {
  const [y, mo] = ymd.split("-").map(Number);
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

/** Format any Date to YYYY-MM-DD in IST (for DayPicker selections). */
export function dateToYmdIST(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}
