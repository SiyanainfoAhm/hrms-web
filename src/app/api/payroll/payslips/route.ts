import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const searchParams = request.nextUrl.searchParams;
  const periodId = searchParams.get("periodId");

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ payslips: [] });

  let query = supabase
    .from("HRMS_payslips")
    .select(`
      id, payroll_period_id, employee_user_id, pay_days,
      basic, hra, allowances, deductions, gross_pay, net_pay, ctc,
      bank_name, bank_account_number, bank_ifsc, generated_at
    `)
    .eq("company_id", me.company_id);
  if (periodId) query = query.eq("payroll_period_id", periodId);
  const { data: slips, error } = await query.order("generated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const userIds = [...new Set((slips ?? []).map((s: any) => s.employee_user_id).filter(Boolean))];
  const { data: users } = userIds.length
    ? await supabase.from("HRMS_users").select("id, name, email").in("id", userIds)
    : { data: [] };
  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  return NextResponse.json({
    payslips: (slips ?? []).map((s: any) => ({
      id: s.id,
      payrollPeriodId: s.payroll_period_id,
      employeeUserId: s.employee_user_id,
      employeeName: userMap.get(s.employee_user_id)?.name ?? null,
      employeeEmail: userMap.get(s.employee_user_id)?.email ?? null,
      payDays: s.pay_days ?? 0,
      basic: s.basic,
      hra: s.hra,
      allowances: s.allowances,
      deductions: s.deductions,
      grossPay: s.gross_pay,
      netPay: s.net_pay,
      ctc: s.ctc != null ? Number(s.ctc) : null,
      bankName: s.bank_name,
      bankAccountNumber: s.bank_account_number,
      bankIfsc: s.bank_ifsc,
      generatedAt: new Date(s.generated_at).toISOString(),
    })),
  });
}
