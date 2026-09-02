import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { istTodayYmd } from "@/lib/istCalendar";
import { computeLeaveBalanceRows } from "@/lib/leaveBalancesCompute";
import { loadLeaveBalanceAdjustments } from "@/lib/leaveBalanceAdjustments";
import { asOfYmdForLeaveEntitlementBooking } from "@/lib/leavePolicy";

function isApprover(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isApprover(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ adjustments: [] });

  const { data: targetUser, error: targetErr } = await supabase
    .from("HRMS_users")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 400 });
  if (!targetUser || targetUser.company_id !== me.company_id) return NextResponse.json({ adjustments: [] });

  const { data, error } = await supabase
    .from("HRMS_leave_balance_adjustments")
    .select(
      "id, leave_type_id, adjustment_days, effective_from, reason, created_at, created_by, HRMS_leave_types(name, payslip_slot)",
    )
    .eq("company_id", me.company_id)
    .eq("employee_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const adjustments = (data ?? []).map((r: any) => ({
    id: r.id,
    leaveTypeId: r.leave_type_id,
    leaveTypeName: r.HRMS_leave_types?.name ?? "",
    payslipSlot: r.HRMS_leave_types?.payslip_slot ?? null,
    adjustmentDays: Number(r.adjustment_days),
    effectiveFrom: String(r.effective_from).slice(0, 10),
    reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by ?? null,
  }));

  return NextResponse.json({ adjustments });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isApprover(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const employeeUserId = body?.employeeUserId ? String(body.employeeUserId) : "";
  const leaveTypeId = body?.leaveTypeId ? String(body.leaveTypeId) : "";
  const adjustmentDays = Number(body?.adjustmentDays);
  const reason = body?.reason ? String(body.reason).trim() : "";
  const todayYmd = istTodayYmd();
  const effectiveFrom = body?.effectiveFrom
    ? asOfYmdForLeaveEntitlementBooking(String(body.effectiveFrom), todayYmd)
    : todayYmd;

  if (!employeeUserId) return NextResponse.json({ error: "Employee is required" }, { status: 400 });
  if (!leaveTypeId) return NextResponse.json({ error: "Leave type is required" }, { status: 400 });
  if (!Number.isFinite(adjustmentDays) || adjustmentDays === 0) {
    return NextResponse.json({ error: "Adjustment days must be a non-zero number" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "Company not found" }, { status: 400 });

  const { data: targetUser, error: targetErr } = await supabase
    .from("HRMS_users")
    .select("id, company_id, date_of_joining")
    .eq("id", employeeUserId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 400 });
  if (!targetUser || targetUser.company_id !== me.company_id) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { data: leaveType, error: typeErr } = await supabase
    .from("HRMS_leave_types")
    .select("id")
    .eq("id", leaveTypeId)
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (typeErr) return NextResponse.json({ error: typeErr.message }, { status: 400 });
  if (!leaveType) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });

  const { data: inserted, error: insertErr } = await supabase
    .from("HRMS_leave_balance_adjustments")
    .insert({
      company_id: me.company_id,
      employee_user_id: employeeUserId,
      leave_type_id: leaveTypeId,
      adjustment_days: adjustmentDays,
      effective_from: effectiveFrom,
      reason,
      created_by: session.id,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  // Return updated balance for this type
  const { data: policies } = await supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code, payslip_slot)")
    .eq("company_id", me.company_id)
    .eq("leave_type_id", leaveTypeId);

  const { data: leaves } = await supabase
    .from("HRMS_leave_requests")
    .select("leave_type_id, start_date, end_date, total_days")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", employeeUserId)
    .eq("status", "approved");

  const adjustments = await loadLeaveBalanceAdjustments(supabase, me.company_id, employeeUserId);
  const rows = computeLeaveBalanceRows(
    (policies ?? []) as any[],
    (leaves ?? []).map((r: any) => ({
      leave_type_id: r.leave_type_id,
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10),
      total_days: Number(r.total_days) || 0,
    })),
    targetUser.date_of_joining ? String(targetUser.date_of_joining).slice(0, 10) : null,
    effectiveFrom,
    adjustments,
  );
  const balance = rows.find((r) => r.leaveTypeId === leaveTypeId);

  return NextResponse.json({
    ok: true,
    id: inserted?.id,
    balance: balance
      ? {
          leaveTypeId: balance.leaveTypeId,
          leaveTypeName: balance.leaveTypeName,
          entitled: balance.entitled,
          used: balance.used,
          adjustmentOffset: balance.adjustmentOffset,
          remaining: balance.remaining,
        }
      : null,
  });
}
