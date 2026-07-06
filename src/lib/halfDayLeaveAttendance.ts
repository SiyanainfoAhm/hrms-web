import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIN_COMBINED_BREAK_MINUTES,
  MIN_COMBINED_BREAK_MINUTES_HALF_DAY,
} from "@/lib/attendancePolicy";

export type HalfDayLeaveRow = {
  employee_user_id?: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
};

/** Single-calendar-day approved leave with fractional days (e.g. 0.5). */
export function isHalfDayApprovedLeaveRow(row: HalfDayLeaveRow): boolean {
  const start = String(row.start_date).slice(0, 10);
  const end = String(row.end_date).slice(0, 10);
  if (start !== end) return false;
  const total = Number(row.total_days);
  return Number.isFinite(total) && total > 0 && total < 1;
}

export function halfDayLeaveDatesFromRows(rows: HalfDayLeaveRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (!isHalfDayApprovedLeaveRow(row)) continue;
    set.add(String(row.start_date).slice(0, 10));
  }
  return set;
}

export function halfDayLeaveDatesByUserFromRows(rows: HalfDayLeaveRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const uid = row.employee_user_id;
    if (!uid || !isHalfDayApprovedLeaveRow(row)) continue;
    const ymd = String(row.start_date).slice(0, 10);
    const set = map.get(uid) ?? new Set<string>();
    set.add(ymd);
    map.set(uid, set);
  }
  return map;
}

export function minimumCombinedBreakMinutesForWorkDate(
  workDateYmd: string,
  halfDayLeaveDates?: Set<string> | null,
): number {
  return halfDayLeaveDates?.has(workDateYmd)
    ? MIN_COMBINED_BREAK_MINUTES_HALF_DAY
    : MIN_COMBINED_BREAK_MINUTES;
}

async function loadApprovedHalfDayLeaveRows(
  supabase: SupabaseClient,
  companyId: string,
  rangeStartYmd: string,
  rangeEndYmd: string,
  userIds?: string[],
): Promise<HalfDayLeaveRow[]> {
  let q = supabase
    .from("HRMS_leave_requests")
    .select("employee_user_id, start_date, end_date, total_days")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .lte("start_date", rangeEndYmd)
    .gte("end_date", rangeStartYmd);
  if (userIds?.length) q = q.in("employee_user_id", userIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as HalfDayLeaveRow[]).filter(isHalfDayApprovedLeaveRow);
}

export async function loadHalfDayLeaveDatesForUser(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  rangeStartYmd: string,
  rangeEndYmd: string,
): Promise<Set<string>> {
  const rows = await loadApprovedHalfDayLeaveRows(supabase, companyId, rangeStartYmd, rangeEndYmd, [userId]);
  return halfDayLeaveDatesFromRows(rows);
}

export async function loadHalfDayLeaveDatesByUserId(
  supabase: SupabaseClient,
  companyId: string,
  userIds: string[],
  rangeStartYmd: string,
  rangeEndYmd: string,
): Promise<Map<string, Set<string>>> {
  if (!userIds.length) return new Map();
  const rows = await loadApprovedHalfDayLeaveRows(supabase, companyId, rangeStartYmd, rangeEndYmd, userIds);
  return halfDayLeaveDatesByUserFromRows(rows);
}
