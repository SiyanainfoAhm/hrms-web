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

export type OfficeLeaveSyncResult = {
  synced: number;
  skipped: string[];
  removed: number;
};

export type OfficeLeaveBackfillSummary = {
  leaveRequestsChecked: number;
  datesEvaluated: number;
  attendanceRowsCreated: number;
  existingRowsSkipped: number;
  weekendsSkipped: number;
  holidaysSkipped: number;
  realAttendancePreserved: number;
  errors: string[];
};

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

/** Approved Office Leave working days inside a payroll/attendance window. */
export function officeLeavePresentDatesInWindow(args: {
  startYmd: string;
  endYmd: string;
  leaveStartYmd: string;
  leaveEndYmd: string;
  holidays: HolidayRow[];
  employeeDivisionId: string | null | undefined;
}): string[] {
  const overlapStart = args.startYmd > args.leaveStartYmd ? args.startYmd : args.leaveStartYmd;
  const overlapEnd = args.endYmd < args.leaveEndYmd ? args.endYmd : args.leaveEndYmd;
  if (overlapEnd < overlapStart) return [];
  return officeLeaveWorkDatesInRange({
    startYmd: overlapStart,
    endYmd: overlapEnd,
    holidays: args.holidays,
    employeeDivisionId: args.employeeDivisionId,
  });
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
    lunch_break_segments: [] as { out: string; in: string }[],
    tea_break_segments: [] as { out: string; in: string }[],
    status: "present",
    in_office: false,
    check_in_in_office: false,
    check_out_in_office: false,
    office_note: "Office Leave",
    notes: "Approved Office Leave",
    is_office_leave: true,
    office_leave_request_id: args.leaveRequestId,
    office_leave_attachment_url: args.attachmentUrl,
    agent_active_minutes: OFFICE_LEAVE_ACTIVE_MINUTES,
    agent_idle_minutes: OFFICE_LEAVE_BREAK_MINUTES,
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
    agentIdleMinutes: OFFICE_LEAVE_BREAK_MINUTES,
    disconnectedMinutes: 0,
    meetsEightHourWork: true,
  };
}

async function removeObsoleteSyntheticOfficeLeaveRows(args: {
  supabase: SupabaseClient;
  companyId: string;
  leaveRequestId: string;
  keepWorkDates: Set<string>;
}): Promise<number> {
  const { data: rows, error } = await args.supabase
    .from("HRMS_attendance_logs")
    .select("id, work_date")
    .eq("company_id", args.companyId)
    .eq("office_leave_request_id", args.leaveRequestId)
    .eq("is_office_leave", true);
  if (error) throw new Error(error.message);

  const obsoleteIds = (rows ?? [])
    .filter((row) => !args.keepWorkDates.has(String(row.work_date).slice(0, 10)))
    .map((row) => row.id)
    .filter(Boolean);
  if (!obsoleteIds.length) return 0;

  const { error: delErr } = await args.supabase
    .from("HRMS_attendance_logs")
    .delete()
    .in("id", obsoleteIds);
  if (delErr) throw new Error(delErr.message);
  return obsoleteIds.length;
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
}): Promise<OfficeLeaveSyncResult> {
  const workDates = officeLeaveWorkDatesInRange({
    startYmd: args.startYmd,
    endYmd: args.endYmd,
    holidays: args.holidays,
    employeeDivisionId: args.employeeDivisionId,
  });
  const workDateSet = new Set(workDates);
  const removed = await removeObsoleteSyntheticOfficeLeaveRows({
    supabase: args.supabase,
    companyId: args.companyId,
    leaveRequestId: args.leaveRequestId,
    keepWorkDates: workDateSet,
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

  return { synced, skipped, removed };
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

export async function backfillApprovedOfficeLeaveAttendance(args: {
  supabase: SupabaseClient;
  companyId: string;
  leaveRequestId?: string;
  employeeUserId?: string;
}): Promise<OfficeLeaveBackfillSummary> {
  const summary: OfficeLeaveBackfillSummary = {
    leaveRequestsChecked: 0,
    datesEvaluated: 0,
    attendanceRowsCreated: 0,
    existingRowsSkipped: 0,
    weekendsSkipped: 0,
    holidaysSkipped: 0,
    realAttendancePreserved: 0,
    errors: [],
  };

  let q = args.supabase
    .from("HRMS_leave_requests")
    .select(
      "id, company_id, employee_id, employee_user_id, start_date, end_date, attachment_url, HRMS_leave_types(code)",
    )
    .eq("company_id", args.companyId)
    .eq("status", "approved");
  if (args.leaveRequestId) q = q.eq("id", args.leaveRequestId);
  if (args.employeeUserId) q = q.eq("employee_user_id", args.employeeUserId);

  const { data: leaveRows, error: leaveErr } = await q;
  if (leaveErr) {
    summary.errors.push(leaveErr.message);
    return summary;
  }

  for (const row of leaveRows ?? []) {
    const ltRaw: any = (row as any).HRMS_leave_types;
    const ltObj = Array.isArray(ltRaw) ? ltRaw[0] : ltRaw;
    if (!isOfficeLeaveTypeCode(ltObj?.code)) continue;

    summary.leaveRequestsChecked += 1;
    const leaveRequestId = String((row as any).id);
    const employeeId = String((row as any).employee_id);
    const startYmd = String((row as any).start_date).slice(0, 10);
    const endYmd = String((row as any).end_date).slice(0, 10);
    const attachmentUrl = (row as any).attachment_url ? String((row as any).attachment_url) : null;

    const { data: empDivRow, error: divErr } = await args.supabase
      .from("HRMS_employees")
      .select("division_id")
      .eq("company_id", args.companyId)
      .eq("id", employeeId)
      .maybeSingle();
    if (divErr) {
      summary.errors.push(`${leaveRequestId}: ${divErr.message}`);
      continue;
    }
    const employeeDivisionId = (empDivRow as any)?.division_id
      ? String((empDivRow as any).division_id)
      : null;

    let holidays: HolidayRow[] = [];
    try {
      holidays = await loadHolidaysForOfficeLeave({
        supabase: args.supabase,
        companyId: args.companyId,
        employeeDivisionId,
      });
    } catch (e) {
      summary.errors.push(
        `${leaveRequestId}: ${e instanceof Error ? e.message : "Failed to load holidays"}`,
      );
      continue;
    }

    const holidaySet = buildHolidayYmdSet(holidays, employeeDivisionId);
    for (const ymd of eachYmdInRange(startYmd, endYmd)) {
      summary.datesEvaluated += 1;
      if (isWeekendYmd(ymd)) {
        summary.weekendsSkipped += 1;
        continue;
      }
      if (holidaySet.has(ymd)) {
        summary.holidaysSkipped += 1;
        continue;
      }

      const { data: existing, error: exErr } = await args.supabase
        .from("HRMS_attendance_logs")
        .select("id, is_office_leave, check_in_at")
        .eq("company_id", args.companyId)
        .eq("employee_id", employeeId)
        .eq("work_date", ymd)
        .maybeSingle();
      if (exErr) {
        summary.errors.push(`${leaveRequestId}/${ymd}: ${exErr.message}`);
        continue;
      }
      if (existing?.check_in_at && !existing.is_office_leave) {
        summary.realAttendancePreserved += 1;
        continue;
      }
      if (existing?.is_office_leave) {
        summary.existingRowsSkipped += 1;
        continue;
      }

      try {
        const patch = officeLeaveAttendancePatch({
          workDateYmd: ymd,
          leaveRequestId,
          attachmentUrl,
        });
        const { error: insErr } = await args.supabase.from("HRMS_attendance_logs").insert({
          company_id: args.companyId,
          employee_id: employeeId,
          ...patch,
          created_at: new Date().toISOString(),
        });
        if (insErr) {
          summary.errors.push(`${leaveRequestId}/${ymd}: ${insErr.message}`);
          continue;
        }
        summary.attendanceRowsCreated += 1;
      } catch (e) {
        summary.errors.push(
          `${leaveRequestId}/${ymd}: ${e instanceof Error ? e.message : "Insert failed"}`,
        );
      }
    }
  }

  return summary;
}
