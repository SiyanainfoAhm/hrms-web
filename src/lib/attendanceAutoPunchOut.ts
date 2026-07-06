import { addDays, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveCombinedBreakBreakdown } from "@/lib/attendancePolicy";
import {
  getAttendanceContextForUser,
  IST_TZ,
  type AttendanceTimeZoneId,
} from "@/lib/attendanceTimeZone";
import {
  loadHalfDayLeaveDatesForUser,
  minimumCombinedBreakMinutesForWorkDate,
} from "@/lib/halfDayLeaveAttendance";

/** Shown in red on company attendance — marks user did not punch out manually. */
export const AUTO_PUNCH_OUT_USER_NOTE = "Didn't punch out by user.";

export const AUTO_PUNCH_OUT_SYSTEM_NOTE =
  "Punched out automatically at shift end (user did not punch out).";

function clampMinutes(n: number): number {
  return Math.min(24 * 60, Math.max(0, Math.round(n)));
}

function addAccumulatedMinutes(
  accumMin: number,
  startedAtIso: string | null | undefined,
  endIso: string,
): number {
  const base = clampMinutes(Number(accumMin) || 0);
  if (!startedAtIso) return base;
  const s = new Date(String(startedAtIso)).getTime();
  const n = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(n) || n <= s) return base;
  return clampMinutes(base + Math.round((n - s) / 60000));
}

/** Shift end instant in UTC ISO (day shift: same calendar day; night shift: next calendar day). */
export function computeShiftEndIso(args: {
  workDateYmd: string;
  shiftEndTime: string | null;
  isNightShift: boolean;
  tz: AttendanceTimeZoneId;
}): string {
  const endTime = (args.shiftEndTime || (args.isNightShift ? "02:00" : "18:00")).trim().slice(0, 5);
  const [y, m, d] = args.workDateYmd.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Invalid work date");

  let endDateYmd = args.workDateYmd;
  if (args.isNightShift) {
    endDateYmd = format(addDays(new Date(y, m - 1, d), 1), "yyyy-MM-dd");
  }

  const local = `${endDateYmd}T${endTime}:00`;
  const out = fromZonedTime(local, args.tz);
  return out.toISOString();
}

export function appendAutoPunchOutNotes(existingNotes: string | null | undefined): string {
  const base = (existingNotes ?? "").trim();
  const parts = [base, AUTO_PUNCH_OUT_SYSTEM_NOTE, AUTO_PUNCH_OUT_USER_NOTE].filter(Boolean);
  return parts.join(" ").trim();
}

export function notesIndicateAutoPunchOut(notes: string | null | undefined): boolean {
  return String(notes ?? "").includes(AUTO_PUNCH_OUT_USER_NOTE);
}

type OpenLogRow = {
  id: string;
  work_date: string;
  check_in_at: string;
  check_out_at: string | null;
  lunch_break_minutes: number | null;
  tea_break_minutes: number | null;
  lunch_break_started_at?: string | null;
  tea_break_started_at?: string | null;
  lunch_check_in_at?: string | null;
  tea_check_in_at?: string | null;
  notes?: string | null;
  office_note?: string | null;
  check_in_in_office?: boolean | null;
  in_office?: boolean | null;
};

export function buildAutoPunchOutPatch(
  row: OpenLogRow,
  checkOutIso: string,
  options?: { minimumBreakMinutes?: number },
) {
  const inMs = new Date(String(row.check_in_at)).getTime();
  const outMs = new Date(checkOutIso).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs <= inMs) {
    throw new Error("Shift end is not after check-in");
  }

  const finalLunchMin = addAccumulatedMinutes(
    Number(row.lunch_break_minutes) || 0,
    row.lunch_break_started_at ?? null,
    checkOutIso,
  );
  const finalTeaMin = addAccumulatedMinutes(
    Number(row.tea_break_minutes) || 0,
    row.tea_break_started_at ?? null,
    checkOutIso,
  );
  const grossMinutes = Math.round((outMs - inMs) / 60000);
  const effectiveBreak = effectiveCombinedBreakBreakdown({
    lunchMinutes: finalLunchMin,
    teaMinutes: finalTeaMin,
    grossWorkMinutes: grossMinutes,
    minimumBreakMinutes: options?.minimumBreakMinutes,
  });
  const totalHours = Math.round((grossMinutes / 60) * 100) / 100;

  return {
    check_out_at: checkOutIso,
    lunch_break_minutes: effectiveBreak.lunchBreakMinutes,
    tea_break_minutes: effectiveBreak.teaBreakMinutes,
    lunch_break_started_at: null,
    tea_break_started_at: null,
    tea_check_in_at: row.tea_break_started_at ? checkOutIso : row.tea_check_in_at ?? null,
    total_hours: totalHours,
    status: "present",
    notes: appendAutoPunchOutNotes(row.notes),
    updated_at: checkOutIso,
  };
}

/**
 * Close prior open attendance rows (forgot to punch out) at shift end before a new punch-in.
 */
export async function autoCloseForgottenPunchOuts(args: {
  supabase: SupabaseClient;
  companyId: string;
  employeeId: string;
  currentWorkDate: string;
}): Promise<number> {
  const ctx = await getAttendanceContextForUser({
    supabase: args.supabase,
    companyId: args.companyId,
    attendanceEmployeeId: args.employeeId,
  });

  const { data: openRows, error } = await args.supabase
    .from("HRMS_attendance_logs")
    .select(
      "id, work_date, check_in_at, check_out_at, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_in_at, tea_check_in_at, notes, office_note, check_in_in_office, in_office",
    )
    .eq("company_id", args.companyId)
    .eq("employee_id", args.employeeId)
    .not("check_in_at", "is", null)
    .is("check_out_at", null)
    .lt("work_date", args.currentWorkDate);

  if (error) throw error;
  const rows = (openRows ?? []) as OpenLogRow[];
  let closed = 0;

  const { data: empRow } = await args.supabase
    .from("HRMS_employees")
    .select("user_id")
    .eq("company_id", args.companyId)
    .eq("id", args.employeeId)
    .maybeSingle();
  const employeeUserId = empRow?.user_id ? String(empRow.user_id) : null;

  const oldestWorkDate =
    rows.length > 0
      ? rows.reduce((min, r) => {
          const d = String(r.work_date);
          return d < min ? d : min;
        }, String(rows[0].work_date))
      : args.currentWorkDate;

  const halfDayLeaveDates =
    employeeUserId != null
      ? await loadHalfDayLeaveDatesForUser(
          args.supabase,
          args.companyId,
          employeeUserId,
          oldestWorkDate,
          args.currentWorkDate,
        )
      : new Set<string>();

  const nowMs = Date.now();

  for (const row of rows) {
    const checkOutIso = computeShiftEndIso({
      workDateYmd: String(row.work_date),
      shiftEndTime: ctx.shiftEndTime,
      isNightShift: ctx.isNightShift,
      tz: ctx.timeZone,
    });

    if (new Date(checkOutIso).getTime() > nowMs) {
      continue;
    }

    let patch: ReturnType<typeof buildAutoPunchOutPatch>;
    try {
      const workDateYmd = String(row.work_date);
      patch = buildAutoPunchOutPatch(row, checkOutIso, {
        minimumBreakMinutes: minimumCombinedBreakMinutesForWorkDate(workDateYmd, halfDayLeaveDates),
      });
    } catch {
      continue;
    }

    const { error: upErr } = await args.supabase
      .from("HRMS_attendance_logs")
      .update(patch)
      .eq("id", row.id);
    if (upErr) continue;

    try {
      await args.supabase.from("HRMS_attendance_state").upsert(
        {
          company_id: args.companyId,
          employee_id: args.employeeId,
          attendance_log_id: row.id,
          work_date: row.work_date,
          status: "INACTIVE",
          updated_at: checkOutIso,
        } as any,
        { onConflict: "company_id,employee_id" },
      );
    } catch {
      // best-effort
    }

    try {
      await args.supabase
        .from("HRMS_activity_sessions")
        .update({ ended_at: checkOutIso, last_heartbeat_at: checkOutIso })
        .eq("company_id", args.companyId)
        .eq("employee_id", args.employeeId)
        .eq("attendance_log_id", row.id)
        .is("ended_at", null);
    } catch {
      // best-effort
    }

    closed += 1;
  }

  return closed;
}

/** Default shift end when employee has no shift assigned (day: 6 PM IST). */
export function defaultShiftEndIso(workDateYmd: string): string {
  return computeShiftEndIso({
    workDateYmd,
    shiftEndTime: "18:00",
    isNightShift: false,
    tz: IST_TZ,
  });
}
