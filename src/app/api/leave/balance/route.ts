import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { computeLeaveBalanceRows } from "@/lib/leaveBalancesCompute";
import { leaveYearStart } from "@/lib/leavePolicy";

function todayIstYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

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

  const asOfYmd = asOfParam || todayIstYmd();
  const asOf = new Date(asOfYmd + "T00:00:00Z");

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
  );

  const balances = rows.map((row) => {
    const p = (policies ?? []).find((x: any) => x.leave_type_id === row.leaveTypeId);
    const pol = p as any;
    const periodStartStr = p
      ? leaveYearStart(asOf, Number(pol?.reset_month ?? 1), Number(pol?.reset_day ?? 1)).toISOString().slice(0, 10)
      : asOfYmd;

    return {
      leaveTypeId: row.leaveTypeId,
      leaveTypeName: row.leaveTypeName,
      payslipSlot: row.payslipSlot,
      isPaid: row.isPaid,
      accrualMethod: p?.accrual_method,
      entitled: row.entitled,
      used: row.used,
      remaining: row.remaining,
      periodStart: periodStartStr,
    };
  });

  return NextResponse.json({ balances });
}

