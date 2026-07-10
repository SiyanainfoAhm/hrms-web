import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { ensureEmployeeMirrorForUser } from "@/lib/ensureEmployeeMirror";
import { istTodayYmd } from "@/lib/istCalendar";
import { type ApprovedLeave } from "@/lib/leavePolicy";
import { computeLeavePaidUnpaidSplit, leavePolicyFromRow } from "@/lib/leavePaidUnpaidSplit";
import { notifyLeaveRequestCreated, notifyLeaveRequestDecided } from "@/lib/hrmsTransactionNotify";
import { computeLeaveBookingSummary, type HolidayRow } from "@/lib/leaveBookingDays";
import {
  isOfficeLeaveTypeCode,
  loadHolidaysForOfficeLeave,
  removeOfficeLeaveAttendance,
  syncOfficeLeaveToAttendance,
} from "@/lib/officeLeaveAttendance";

function isApprover(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function diffDaysInclusive(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

function mapLeaveRow(
  r: any,
  userById: Map<string, { name: string | null; email: string | null }>,
) {
  const uid = r.employee_user_id as string | undefined;
  const u = uid ? userById.get(uid) : undefined;
  return {
    id: r.id as string,
    leaveTypeId: r.leave_type_id as string,
    leaveTypeName: r.HRMS_leave_types?.name ?? "",
    employeeUserId: uid ?? null,
    employeeName: u?.name ?? null,
    employeeEmail: u?.email ?? null,
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    totalDays: r.total_days,
    paidDays: r.paid_days,
    unpaidDays: r.unpaid_days,
    reason: r.reason as string | null,
    status: r.status as string,
    createdAt: new Date(r.created_at).toISOString(),
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : null,
    rejectionReason: r.rejection_reason as string | null,
    attachmentUrl: (r.attachment_url as string | null) ?? null,
  };
}

async function employeeLabelMapForLeaveRows(
  rows: any[],
): Promise<Map<string, { name: string | null; email: string | null }>> {
  const uids = [...new Set((rows ?? []).map((r: any) => r.employee_user_id as string).filter(Boolean))];
  const userById = new Map<string, { name: string | null; email: string | null }>();
  if (!uids.length) return userById;
  const { data: users, error: uErr } = await supabase.from("HRMS_users").select("id, name, email").in("id", uids);
  if (uErr) throw new Error(uErr.message);
  for (const u of users ?? []) {
    userById.set(u.id as string, { name: (u as any).name ?? null, email: (u as any).email ?? null });
  }
  return userById;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ requests: [], total: 0 });

  const { searchParams } = new URL(request.url);
  const overlapFor = (searchParams.get("overlapFor") || "").trim();
  if (overlapFor) {
    if (isApprover(session.role)) {
      const { data: emp, error: empErr } = await supabase
        .from("HRMS_users")
        .select("id, company_id")
        .eq("id", overlapFor)
        .maybeSingle();
      if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
      if (!emp || emp.company_id !== me.company_id) {
        return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
      }
    } else if (overlapFor !== session.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: rows, error: ovErr } = await supabase
      .from("HRMS_leave_requests")
      .select("start_date, end_date, status, employee_user_id")
      .eq("company_id", me.company_id)
      .eq("employee_user_id", overlapFor)
      .in("status", ["pending", "approved"]);
    if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 400 });
    const { data: empDivForOverlap } = await supabase
      .from("HRMS_employees")
      .select("division_id")
      .eq("company_id", me.company_id)
      .eq("user_id", overlapFor)
      .maybeSingle();
    return NextResponse.json({
      requests: (rows ?? []).map((r: any) => ({
        startDate: String(r.start_date).slice(0, 10),
        endDate: String(r.end_date).slice(0, 10),
        status: String(r.status),
      })),
      employeeDivisionId: (empDivForOverlap as any)?.division_id ? String((empDivForOverlap as any).division_id) : null,
    });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawSize = parseInt(searchParams.get("pageSize") || "0", 10);
  const paginated = rawSize > 0;
  const pageSize = Math.min(100, Math.max(1, rawSize));

  let query = supabase
    .from("HRMS_leave_requests")
    .select("*, HRMS_leave_types(name)", paginated ? { count: "exact" } : {})
    .eq("company_id", me.company_id)
    .order("created_at", { ascending: false });

  if (!isApprover(session.role)) {
    query = query.eq("employee_user_id", session.id);
  }

  if (paginated) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    let userById: Map<string, { name: string | null; email: string | null }>;
    try {
      userById = await employeeLabelMapForLeaveRows(data ?? []);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to load employees" }, { status: 400 });
    }
    return NextResponse.json({
      requests: (data ?? []).map((r) => mapLeaveRow(r, userById)),
      total: count ?? 0,
      page,
      pageSize,
    });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let userById: Map<string, { name: string | null; email: string | null }>;
  try {
    userById = await employeeLabelMapForLeaveRows(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load employees" }, { status: 400 });
  }

  return NextResponse.json({
    requests: (data ?? []).map((r) => mapLeaveRow(r, userById)),
  });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const leaveTypeId = typeof body?.leaveTypeId === "string" ? body.leaveTypeId : "";
  const startDate = typeof body?.startDate === "string" ? body.startDate : "";
  const endDate = typeof body?.endDate === "string" ? body.endDate : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : undefined;
  const attachmentUrl = typeof body?.attachmentUrl === "string" ? body.attachmentUrl.trim() : "";
  const employeeUserId = typeof body?.employeeUserId === "string" ? body.employeeUserId : null;
  const isHalfDay = body?.isHalfDay === true;
  if (!leaveTypeId || !startDate || !endDate) {
    return NextResponse.json({ error: "Leave type, start date and end date are required" }, { status: 400 });
  }
  const calendarSpan = diffDaysInclusive(startDate, endDate);
  if (!calendarSpan) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id, date_of_joining")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  // Resolve employee: approvers must select a current employee; others add for self
  let targetEmployeeUserId: string;
  let targetEmployeeId: string;
  let targetJoinDate: string | null = null;
  if (isApprover(session.role)) {
    if (!employeeUserId) return NextResponse.json({ error: "Please select an employee" }, { status: 400 });
    const { data: emp, error: empErr } = await supabase
      .from("HRMS_users")
      .select("id, company_id, employment_status, date_of_joining")
      .eq("id", employeeUserId)
      .maybeSingle();
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
    if (!emp || emp.company_id !== me.company_id) return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
    if (emp.employment_status !== "current") return NextResponse.json({ error: "Only current employees can have leave added" }, { status: 400 });
    targetEmployeeUserId = emp.id as string;
    targetJoinDate = emp.date_of_joining ? String(emp.date_of_joining) : null;
  } else {
    targetEmployeeUserId = session.id;
    targetJoinDate = me.date_of_joining ? String(me.date_of_joining) : null;
  }

  const mirror = await ensureEmployeeMirrorForUser(supabase, me.company_id, targetEmployeeUserId);
  if (!mirror.ok) return NextResponse.json({ error: mirror.error }, { status: 400 });
  targetEmployeeId = mirror.row.id;

  // Ensure leave type belongs to the same company, and apply visibility rules
  const { data: lt, error: ltErr } = await supabase
    .from("HRMS_leave_types")
    .select("id, name, code, is_paid, HRMS_leave_policies(*)")
    .eq("company_id", me.company_id)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (ltErr) return NextResponse.json({ error: ltErr.message }, { status: 400 });
  if (!lt) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });

  const codeUpper = String((lt as any)?.code ?? "").toUpperCase();
  const isOfficeLeave = isOfficeLeaveTypeCode(codeUpper);

  if (isOfficeLeave) {
    if (!attachmentUrl) {
      return NextResponse.json({ error: "Attachment is required for Office Leave" }, { status: 400 });
    }
    if (isHalfDay) {
      return NextResponse.json({ error: "Half day does not apply to Office Leave" }, { status: 400 });
    }
  }

  const { data: empDivRow } = await supabase
    .from("HRMS_employees")
    .select("division_id")
    .eq("company_id", me.company_id)
    .eq("user_id", targetEmployeeUserId)
    .maybeSingle();
  const employeeDivisionId = (empDivRow as any)?.division_id ? String((empDivRow as any).division_id) : null;

  let holidayQuery = supabase
    .from("HRMS_holidays")
    .select("holiday_date, holiday_end_date, division_id")
    .eq("company_id", me.company_id);
  if (employeeDivisionId) {
    holidayQuery = holidayQuery.or(`division_id.is.null,division_id.eq.${employeeDivisionId}`);
  }
  const { data: holidayRows, error: holErr } = await holidayQuery;
  if (holErr) return NextResponse.json({ error: holErr.message }, { status: 400 });

  const { data: blockLeaves, error: blErr } = await supabase
    .from("HRMS_leave_requests")
    .select("start_date, end_date, status")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", targetEmployeeUserId)
    .in("status", ["pending", "approved"]);
  if (blErr) return NextResponse.json({ error: blErr.message }, { status: 400 });

  if (isHalfDay && codeUpper === "HL") {
    return NextResponse.json({ error: "Half-day checkbox does not apply to Half Leave (HL) type" }, { status: 400 });
  }
  if (isHalfDay) {
    if (startDate !== endDate) {
      return NextResponse.json({ error: "Half day is only allowed when start and end date are the same" }, { status: 400 });
    }
    if (calendarSpan !== 1) {
      return NextResponse.json({ error: "Half day applies to a single calendar day only" }, { status: 400 });
    }
  }

  const booking = computeLeaveBookingSummary({
    startYmd: startDate,
    endYmd: endDate,
    holidays: (holidayRows ?? []) as HolidayRow[],
    employeeDivisionId,
    existingLeaves: (blockLeaves ?? []).map((r: any) => ({
      startDate: String(r.start_date).slice(0, 10),
      endDate: String(r.end_date).slice(0, 10),
      status: String(r.status),
    })),
    leaveTypeCodeUpper: codeUpper,
    isHalfDay: Boolean(isHalfDay && codeUpper !== "HL"),
  });
  if (booking.overlapError) {
    return NextResponse.json({ error: booking.overlapError }, { status: 400 });
  }
  if (booking.chargeableDays <= 0) {
    return NextResponse.json(
      { error: "No chargeable leave days in this range (weekends and holidays are excluded)." },
      { status: 400 },
    );
  }
  const totalDays = booking.chargeableDays;

  if (!isApprover(session.role) && lt.is_paid === false) {
    return NextResponse.json({ error: "You are not allowed to request unpaid leave" }, { status: 403 });
  }

  // Compute paid vs unpaid days for payroll: excess beyond balance = unpaid
  const pRaw = Array.isArray((lt as any).HRMS_leave_policies)
    ? (lt as any).HRMS_leave_policies[0]
    : (lt as any).HRMS_leave_policies;
  const policy = leavePolicyFromRow(leaveTypeId, pRaw);

  const { data: approvedLeaves, error: usedErr } = await supabase
    .from("HRMS_leave_requests")
    .select("leave_type_id, start_date, end_date, total_days")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", targetEmployeeUserId)
    .eq("status", "approved");
  if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 400 });

  const split = computeLeavePaidUnpaidSplit({
    totalDays,
    startDateYmd: startDate,
    leaveTypeId,
    isPaidLeaveType: lt.is_paid !== false,
    policy,
    joinDateYmd: targetJoinDate,
    todayYmd: istTodayYmd(),
    approvedLeaves: (approvedLeaves ?? []) as ApprovedLeave[],
  });
  const paidDays = isOfficeLeave ? 0 : split.paidDays;
  const unpaidDays = isOfficeLeave ? 0 : split.unpaidDays;

  const now = new Date().toISOString();
  const autoApprove = isApprover(session.role);
  const { data, error } = await supabase
    .from("HRMS_leave_requests")
    .insert([
      {
        company_id: me.company_id,
        employee_id: targetEmployeeId,
        employee_user_id: targetEmployeeUserId,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        paid_days: paidDays,
        unpaid_days: unpaidDays,
        reason: reason || null,
        attachment_url: attachmentUrl || null,
        status: autoApprove ? "approved" : "pending",
        approver_user_id: autoApprove ? session.id : null,
        approved_at: autoApprove ? now : null,
        rejected_at: null,
        rejection_reason: null,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Email notifications via Power Automate (best-effort; do not block leave creation).
  try {
    await notifyLeaveRequestCreated(String((data as any).id));
  } catch (e) {
    console.warn("[leave-email] notify failed", e);
  }

  if (autoApprove && isOfficeLeave) {
    try {
      const holidays = await loadHolidaysForOfficeLeave({
        supabase,
        companyId: me.company_id,
        employeeDivisionId,
      });
      const sync = await syncOfficeLeaveToAttendance({
        supabase,
        companyId: me.company_id,
        employeeId: targetEmployeeId,
        leaveRequestId: String((data as any).id),
        startYmd: startDate,
        endYmd: endDate,
        attachmentUrl: attachmentUrl || null,
        employeeDivisionId,
        holidays,
      });
      return NextResponse.json({ request: data, officeLeaveSync: sync });
    } catch (e) {
      await supabase.from("HRMS_leave_requests").delete().eq("id", (data as any).id);
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? `Office Leave approved but attendance sync failed: ${e.message}`
              : "Office Leave approved but attendance sync failed",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ request: data });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isApprover(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : undefined;
  if (!id) return NextResponse.json({ error: "Request id is required" }, { status: 400 });
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: existing, error: fetchErr } = await supabase
    .from("HRMS_leave_requests")
    .select(
      "id, company_id, employee_id, employee_user_id, leave_type_id, start_date, end_date, total_days, status, attachment_url, HRMS_leave_types(id, code, is_paid, HRMS_leave_policies(*))",
    )
    .eq("id", id)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  const now = new Date().toISOString();
  let paidDaysUpdate: number | undefined;
  let unpaidDaysUpdate: number | undefined;

  const ltRaw: any = (existing as any).HRMS_leave_types;
  const ltObj = Array.isArray(ltRaw) ? ltRaw[0] : ltRaw;
  const leaveTypeCode = String(ltObj?.code ?? "").toUpperCase();
  const isOfficeLeave = isOfficeLeaveTypeCode(leaveTypeCode);

  if (action === "approve" && existing.status !== "approved") {
    const { data: empUser, error: empUserErr } = await supabase
      .from("HRMS_users")
      .select("date_of_joining")
      .eq("id", existing.employee_user_id)
      .maybeSingle();
    if (empUserErr) return NextResponse.json({ error: empUserErr.message }, { status: 400 });

    const ltRawInner: any = (existing as any).HRMS_leave_types;
    const ltObjInner = Array.isArray(ltRawInner) ? ltRawInner[0] : ltRawInner;
    const leaveTypeId = String(existing.leave_type_id);
    const pNested = ltObjInner?.HRMS_leave_policies;
    const pRaw = Array.isArray(pNested) ? pNested[0] : pNested;
    const policy = leavePolicyFromRow(leaveTypeId, pRaw);

    const { data: approvedLeaves, error: usedErr } = await supabase
      .from("HRMS_leave_requests")
      .select("leave_type_id, start_date, end_date, total_days")
      .eq("company_id", me.company_id)
      .eq("employee_user_id", existing.employee_user_id)
      .eq("status", "approved")
      .neq("id", id);
    if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 400 });

    const split = computeLeavePaidUnpaidSplit({
      totalDays: Number(existing.total_days) || 0,
      startDateYmd: String(existing.start_date).slice(0, 10),
      leaveTypeId,
      isPaidLeaveType: ltObjInner?.is_paid !== false,
      policy,
      joinDateYmd: empUser?.date_of_joining ? String(empUser.date_of_joining).slice(0, 10) : null,
      todayYmd: istTodayYmd(),
      approvedLeaves: (approvedLeaves ?? []) as ApprovedLeave[],
    });
    paidDaysUpdate = isOfficeLeave ? 0 : split.paidDays;
    unpaidDaysUpdate = isOfficeLeave ? 0 : split.unpaidDays;
  }

  const payload =
    action === "approve"
      ? {
          status: "approved",
          approver_user_id: session.id,
          approved_at: now,
          rejected_at: null,
          rejection_reason: null,
          ...(paidDaysUpdate != null ? { paid_days: paidDaysUpdate, unpaid_days: unpaidDaysUpdate } : {}),
        }
      : { status: "rejected", approver_user_id: session.id, rejected_at: now, approved_at: null, rejection_reason: rejectionReason || "Rejected" };

  const { data, error } = await supabase
    .from("HRMS_leave_requests")
    .update(payload)
    .eq("id", id)
    .eq("company_id", me.company_id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Email employee on approve/reject (best-effort).
  try {
    await notifyLeaveRequestDecided(String((data as any).id));
  } catch (e) {
    console.warn("[leave-email] decision notify failed", e);
  }

  if (isOfficeLeave) {
    try {
      if (action === "approve") {
        const { data: empDivRow } = await supabase
          .from("HRMS_employees")
          .select("division_id")
          .eq("company_id", me.company_id)
          .eq("id", existing.employee_id)
          .maybeSingle();
        const employeeDivisionId = (empDivRow as any)?.division_id
          ? String((empDivRow as any).division_id)
          : null;
        const holidays = await loadHolidaysForOfficeLeave({
          supabase,
          companyId: me.company_id,
          employeeDivisionId,
        });
        const sync = await syncOfficeLeaveToAttendance({
          supabase,
          companyId: me.company_id,
          employeeId: String(existing.employee_id),
          leaveRequestId: id,
          startYmd: String(existing.start_date).slice(0, 10),
          endYmd: String(existing.end_date).slice(0, 10),
          attachmentUrl: (existing as any).attachment_url
            ? String((existing as any).attachment_url)
            : null,
          employeeDivisionId,
          holidays,
        });
        return NextResponse.json({ request: data, officeLeaveSync: sync });
      }
      if (action === "reject") {
        await removeOfficeLeaveAttendance({
          supabase,
          companyId: me.company_id,
          leaveRequestId: id,
        });
      }
    } catch (e) {
      if (action === "approve") {
        await supabase
          .from("HRMS_leave_requests")
          .update({
            status: existing.status,
            approver_user_id: null,
            approved_at: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq("id", id)
          .eq("company_id", me.company_id);
      }
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to sync Office Leave attendance" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ request: data });
}

