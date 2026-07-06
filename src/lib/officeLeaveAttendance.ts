import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildHolidayYmdSet,
  eachYmdInRange,
  isWeekendYmd,
  type HolidayRow,
} from "@/lib/leaveBookingDays";

export const OFFICE_LEAVE_TYPE_CODE = "OL";

/** Gross span punch-in → punch-out for Office Leave days. */
export const OFFICE_LEAVE_GROSS_MINUTES = 9 * 60;
/** Combined lunch + tea break credited on Office Leave days. */
export const OFFICE_LEAVE_BREAK_MINUTES = 60;
/** Active work after break on Office Leave days. */
export const OFFICE_LEAVE_ACTIVE_MINUTES = 8 * 60;

const OFFICE_LEAVE_TZ = "Asia/Kolkata";
const OFFICE_LEAVE_CHECK_IN = "09:00";
const OFFICE_LEAVE_CHECK_OUT = "18:00";

export function isOfficeLeaveTypeCode(code: string | null | undefined): boolean {
  return String(code ?? "").trim().toUpperCase() === OFFICE_LEAVE_TYPE_CODE;
}

function officeLeaveIso(workDateYmd: string, hm: string): string {
  return fromZonedTime(`${workDateYmd}T${hm}:00`, OFFICE_LEAVE_TZ).toISOString();
}

/** Weekday, non-holiday dates in an approved Office Leave range. */
export function officeLeaveWorkDatesInRange(args: {
  startYmd: string;
  endYmd: string;
  holidays: HolidayRow[];
  employeeDivisionId: string | null | undefined;
}): string[] {
  const holidaySet = buildHolidayYmdSet(args.holidays, args.employeeDivisionId);
  return eachYmdInRange(args.startYmd, args.endYmd).filter(
    (ymd) => !isWeekendYmd(ymd) && !holidaySet.has(ymd),
  );
}

export function officeLeaveAttendancePatch(args: {
  workDateYmd: string;
  leaveRequestId: string;
  attachmentUrl: string | null;
  nowIso?: string;
}) {
  const checkInIso = officeLeaveIso(args.workDateYmd, OFFICE_LEAVE_CHECK_IN);
  const checkOutIso = officeLeaveIso(args.workDateYmd, OFFICE_LEAVE_CHECK_OUT);
  const updatedAt = args.nowIso ?? checkOutIso;
  return {
    work_date: args.workDateYmd,
    check_in_at: checkInIso,
    check_out_at: checkOutIso,
    total_hours: OFFICE_LEAVE_GROSS_MINUTES / 60,
    lunch_break_minutes: OFFICE_LEAVE_BREAK_MINUTES,
    tea_break_minutes: 0,
    lunch_break_started_at: null,
    tea_break_started_at: null,
    lunch_check_out_at: null,
    lunch_check_in_at: null,
    tea_check_out_at: null,
    tea_check_in_at: null,
    lunch_break_segments: null,
    tea_break_segments: null,
    status: "present",
    in_office: false,
    check_in_in_office: false,
    check_out_in_office: false,
    office_note: null,
    notes: "Office Leave",
    is_office_leave: true,
    office_leave_request_id: args.leaveRequestId,
    office_leave_attachment_url: args.attachmentUrl,
    agent_active_minutes: OFFICE_LEAVE_ACTIVE_MINUTES,
    agent_idle_minutes: 0,
    agent_disconnected_minutes: 0,
    updated_at: updatedAt,
  };
}

export function isOfficeLeaveAttendanceLog(log: {
  is_office_leave?: boolean | null;
  office_leave_request_id?: string | null;
}): boolean {
  return Boolean(log.is_office_leave || log.office_leave_request_id);
}

/** Fixed dashboard metrics for Office Leave attendance rows. */
export function officeLeaveMetrics() {
  return {
    grossMinutes: OFFICE_LEAVE_GROSS_MINUTES,
    activeMinutes: OFFICE_LEAVE_ACTIVE_MINUTES,
    idleMinutes: OFFICE_LEAVE_BREAK_MINUTES,
    manualBreakIdleMinutes: OFFICE_LEAVE_BREAK_MINUTES,
    lunchBreakMinutes: OFFICE_LEAVE_BREAK_MINUTES,
    teaBreakMinutes: 0,
    agentActiveMinutes: OFFICE_LEAVE_ACTIVE_MINUTES,
    agentIdleMinutes: 0,
    disconnectedMinutes: 0,
    meetsEightHourWork: true,
  };
}

export async function syncOfficeLeaveToAttendance(args: {
  supabase: SupabaseClient;
  companyId: string;
  employeeId: string;
  leaveRequestId: string;
  startYmd: string;
  endYmd: string;
  attachmentUrl: string | null;
  employeeDivisionId: string | null | undefined;
  holidays: HolidayRow[];
}): Promise<{ synced: number; skipped: string[] }> {
  const workDates = officeLeaveWorkDatesInRange({
    startYmd: args.startYmd,
    endYmd: args.endYmd,
    holidays: args.holidays,
    employeeDivisionId: args.employeeDivisionId,
  });
  const nowIso = new Date().toISOString();
  const skipped: string[] = [];
  let synced = 0;

  for (const workDateYmd of workDates) {
    const { data: existing } = await args.supabase
      .from("HRMS_attendance_logs")
      .select("id, check_in_at, is_office_leave")
      .eq("company_id", args.companyId)
      .eq("employee_id", args.employeeId)
      .eq("work_date", workDateYmd)
      .maybeSingle();

    if (existing?.check_in_at && !existing.is_office_leave) {
      skipped.push(workDateYmd);
      continue;
    }

    const patch = officeLeaveAttendancePatch({
      workDateYmd,
      leaveRequestId: args.leaveRequestId,
      attachmentUrl: args.attachmentUrl,
      nowIso,
    });

    if (existing?.id) {
      const { error } = await args.supabase
        .from("HRMS_attendance_logs")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await args.supabase.from("HRMS_attendance_logs").insert({
        company_id: args.companyId,
        employee_id: args.employeeId,
        ...patch,
        created_at: nowIso,
      });
      if (error) throw new Error(error.message);
    }
    synced += 1;
  }

  return { synced, skipped };
}

export async function removeOfficeLeaveAttendance(args: {
  supabase: SupabaseClient;
  companyId: string;
  leaveRequestId: string;
}): Promise<void> {
  const { error } = await args.supabase
    .from("HRMS_attendance_logs")
    .delete()
    .eq("company_id", args.companyId)
    .eq("office_leave_request_id", args.leaveRequestId)
    .eq("is_office_leave", true);
  if (error) throw new Error(error.message);
}

export async function loadHolidaysForOfficeLeave(args: {
  supabase: SupabaseClient;
  companyId: string;
  employeeDivisionId: string | null | undefined;
}): Promise<HolidayRow[]> {
  let q = args.supabase
    .from("HRMS_holidays")
    .select("holiday_date, holiday_end_date, division_id")
    .eq("company_id", args.companyId);
  if (args.employeeDivisionId) {
    q = q.or(`division_id.is.null,division_id.eq.${args.employeeDivisionId}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HolidayRow[];
}
