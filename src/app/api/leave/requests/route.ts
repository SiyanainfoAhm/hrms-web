import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { computeEntitled, computeUsedDaysForYear, leaveYearStart, type LeavePolicy } from "@/lib/leavePolicy";

function isApprover(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function diffDaysInclusive(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

function mapLeaveRow(r: any) {
  return {
    id: r.id as string,
    leaveTypeId: r.leave_type_id as string,
    leaveTypeName: r.HRMS_leave_types?.name ?? "",
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    totalDays: r.total_days,
    reason: r.reason as string | null,
    status: r.status as string,
    createdAt: new Date(r.created_at).toISOString(),
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : null,
    rejectionReason: r.rejection_reason as string | null,
  };
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
    return NextResponse.json({
      requests: (data ?? []).map(mapLeaveRow),
      total: count ?? 0,
      page,
      pageSize,
    });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    requests: (data ?? []).map(mapLeaveRow),
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
  const employeeUserId = typeof body?.employeeUserId === "string" ? body.employeeUserId : null;
  if (!leaveTypeId || !startDate || !endDate) {
    return NextResponse.json({ error: "Leave type, start date and end date are required" }, { status: 400 });
  }
  const totalDays = diffDaysInclusive(startDate, endDate);
  if (!totalDays) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });

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

  // Resolve HRMS_employees.id (required by DB constraint).
  const { data: empRow, error: empRowErr } = await supabase
    .from("HRMS_employees")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("user_id", targetEmployeeUserId)
    .maybeSingle();
  if (empRowErr) return NextResponse.json({ error: empRowErr.message }, { status: 400 });
  if (!empRow?.id) return NextResponse.json({ error: "Employee record not found for this user" }, { status: 400 });
  targetEmployeeId = String(empRow.id);

  // Ensure leave type belongs to the same company, and apply visibility rules
  const { data: lt, error: ltErr } = await supabase
    .from("HRMS_leave_types")
    .select("id, is_paid, HRMS_leave_policies(*)")
    .eq("company_id", me.company_id)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (ltErr) return NextResponse.json({ error: ltErr.message }, { status: 400 });
  if (!lt) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  if (!isApprover(session.role) && lt.is_paid === false) {
    return NextResponse.json({ error: "You are not allowed to request unpaid leave" }, { status: 403 });
  }

  // Compute paid vs unpaid days for payroll: excess beyond balance = unpaid
  let paidDays = totalDays;
  let unpaidDays = 0;
  if (lt.is_paid === false) {
    paidDays = 0;
    unpaidDays = totalDays;
  } else {
    const pRaw = Array.isArray((lt as any).HRMS_leave_policies) ? (lt as any).HRMS_leave_policies[0] : (lt as any).HRMS_leave_policies;
    if (pRaw) {
      const policy: LeavePolicy = {
        leave_type_id: leaveTypeId,
        accrual_method: pRaw.accrual_method,
        monthly_accrual_rate: pRaw.monthly_accrual_rate,
        annual_quota: pRaw.annual_quota,
        prorate_on_join: Boolean(pRaw.prorate_on_join),
        reset_month: Number(pRaw.reset_month ?? 1),
        reset_day: Number(pRaw.reset_day ?? 1),
        allow_carryover: Boolean(pRaw.allow_carryover),
        carryover_limit: pRaw.carryover_limit,
      };

      const asOf = new Date(startDate + "T00:00:00Z");
      const joinDate = targetJoinDate ? new Date(targetJoinDate + "T00:00:00Z") : null;
      const yearStart = leaveYearStart(asOf, policy.reset_month, policy.reset_day);
      const yearEndExclusive = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, yearStart.getUTCMonth(), yearStart.getUTCDate(), 0, 0, 0, 0));

      const { data: approvedLeaves, error: usedErr } = await supabase
        .from("HRMS_leave_requests")
        .select("leave_type_id, start_date, end_date, total_days")
        .eq("company_id", me.company_id)
        .eq("employee_user_id", targetEmployeeUserId)
        .eq("status", "approved");
      if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 400 });

      const entitled = computeEntitled(policy, joinDate, asOf);
      const remaining = entitled == null ? totalDays : Math.max(0, entitled - computeUsedDaysForYear(approvedLeaves ?? [], leaveTypeId, yearStart, yearEndExclusive));
      paidDays = Math.min(totalDays, remaining);
      unpaidDays = totalDays - paidDays;
    }
  }

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

  const now = new Date().toISOString();
  const payload =
    action === "approve"
      ? { status: "approved", approver_user_id: session.id, approved_at: now, rejected_at: null, rejection_reason: null }
      : { status: "rejected", approver_user_id: session.id, rejected_at: now, approved_at: null, rejection_reason: rejectionReason || "Rejected" };

  const { data, error } = await supabase
    .from("HRMS_leave_requests")
    .update(payload)
    .eq("id", id)
    .eq("company_id", me.company_id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ request: data });
}

