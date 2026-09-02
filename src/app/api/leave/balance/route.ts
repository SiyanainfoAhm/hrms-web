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

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id, date_of_joining")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ balances: [] });

  const searchParams = request.nextUrl.searchParams;
  const userIdParam = searchParams.get("userId");
  const leaveTypeIdParam = searchParams.get("leaveTypeId");
  const asOfParam = searchParams.get("asOf");

  const targetUserId = userIdParam && isApprover(session.role) ? userIdParam : session.id;
  if (userIdParam && !isApprover(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: targetUser, error: targetErr } = await supabase
    .from("HRMS_users")
    .select("id, company_id, date_of_joining")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 400 });
  if (!targetUser || targetUser.company_id !== me.company_id) return NextResponse.json({ balances: [] });

  const todayYmd = istTodayYmd();
  const asOfYmd = asOfParam
    ? asOfYmdForLeaveEntitlementBooking(asOfParam, todayYmd)
    : todayYmd;

  // Load ALL versions for the company — balance picker selects the version in force on asOf.
  let policiesQuery = supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code, payslip_slot)")
    .eq("company_id", me.company_id);
  if (leaveTypeIdParam) policiesQuery = policiesQuery.eq("leave_type_id", leaveTypeIdParam);
  const { data: policies, error: polErr } = await policiesQuery;
  if (polErr) return NextResponse.json({ error: polErr.message }, { status: 400 });

  const { data: leaves, error: leaveErr } = await supabase
    .from("HRMS_leave_requests")
    .select("leave_type_id, start_date, end_date, total_days")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", targetUserId)
    .eq("status", "approved");
  if (leaveErr) return NextResponse.json({ error: leaveErr.message }, { status: 400 });

  let adjustments: Awaited<ReturnType<typeof loadLeaveBalanceAdjustments>> = [];
  try {
    adjustments = await loadLeaveBalanceAdjustments(supabase, me.company_id, targetUserId);
  } catch (adjErr: any) {
    // Table may not exist until migration is applied — balances still work without adjustments.
    if (!adjErr?.message?.includes("HRMS_leave_balance_adjustments")) {
      return NextResponse.json({ error: adjErr?.message || "Failed to load adjustments" }, { status: 400 });
    }
  }

  const rows = computeLeaveBalanceRows(
    (policies ?? []) as any[],
    (leaves ?? []).map((r: any) => ({
      leave_type_id: r.leave_type_id,
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10),
      total_days: Number(r.total_days) || 0,
    })),
    targetUser.date_of_joining ? String(targetUser.date_of_joining).slice(0, 10) : null,
    asOfYmd,
    adjustments,
  );

  const balances = rows.map((row) => ({
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveTypeName,
    payslipSlot: row.payslipSlot,
    isPaid: row.isPaid,
    entitled: row.entitled,
    used: row.used,
    adjustmentOffset: row.adjustmentOffset,
    remaining: row.remaining,
    requestEnabled: row.requestEnabled,
    periodStart: row.periodStart,
    periodEnd: row.periodEndInclusive,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  }));

  return NextResponse.json({ balances });
}
