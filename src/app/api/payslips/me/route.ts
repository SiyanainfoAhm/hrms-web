import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import {
  computeLeaveBalanceRows,
  formatGovernmentLeavePayslipDisplay,
  slipBalanceAsOfYmd,
  type GovernmentLeavePayslipDisplay,
} from "@/lib/leaveBalancesCompute";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ payslips: [], company: null, user: null });

  const [slipRes, companyRes, userRes] = await Promise.all([
    supabase
      .from("HRMS_payslips")
      .select("id, payroll_period_id, net_pay, gross_pay, pay_days, basic, hra, allowances, medical, trans, lta, personal, deductions, currency, payslip_number, generated_at, bank_name, bank_account_number, bank_ifsc, pf_employee, esic_employee, professional_tax, incentive, pr_bonus, reimbursement, tds, payroll_mode")
      .eq("company_id", me.company_id)
      .eq("employee_user_id", session.id)
      .order("generated_at", { ascending: false }),
    supabase
      .from("HRMS_companies")
      .select("name, logo_url, address_line1, address_line2, city, state, country, postal_code")
      .eq("id", me.company_id)
      .single(),
    supabase
      .from("HRMS_users")
      .select("name, employee_code, designation, date_of_joining, aadhaar, pan, uan_number, pf_number, esic_number, department_id, government_pay_level")
      .eq("id", session.id)
      .single(),
  ]);

  const { data: slipData, error } = slipRes;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const slipIds = (slipData ?? []).map((p: { id: string }) => p.id).filter(Boolean);
  const { data: govRows } =
    slipIds.length > 0
      ? await supabase.from("HRMS_government_monthly_payroll").select("*").in("payslip_id", slipIds)
      : { data: [] };
  const govByPayslipId = new Map((govRows ?? []).map((g: { payslip_id: string }) => [g.payslip_id, g]));

  const periodIds = [...new Set((slipData ?? []).map((p: any) => p.payroll_period_id).filter(Boolean))];
  let periodsById = new Map<string, { period_start: string; period_end: string; period_name: string }>();
  if (periodIds.length) {
    const { data: periods } = await supabase
      .from("HRMS_payroll_periods")
      .select("id, period_start, period_end, period_name")
      .in("id", periodIds);
    periodsById = new Map((periods ?? []).map((p: any) => [p.id, p]));
  }

  const fmtDate = (d: string) => {
    const [y, m, day] = d ? d.split("-") : [];
    return y && m && day ? `${day.padStart(2, "0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m, 10) - 1]} ${y}` : "";
  };

  const company = companyRes.data;
  const addrParts = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state, company?.postal_code].filter(Boolean).join(", "),
    company?.country,
  ].filter(Boolean);
  const companyAddress = addrParts.join(", ") || "";

  const user = userRes.data;
  const deptId = (user as { department_id?: string | null } | null)?.department_id;
  const { data: deptRow } = deptId
    ? await supabase.from("HRMS_departments").select("name").eq("id", deptId).maybeSingle()
    : { data: null };

  const rawLogo = (company as { logo_url?: string | null } | null)?.logo_url;
  const logoUrl = typeof rawLogo === "string" && rawLogo.trim() ? rawLogo.trim() : null;

  const { data: policyRows, error: polErr } = await supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code, payslip_slot)")
    .eq("company_id", me.company_id);
  if (polErr) return NextResponse.json({ error: polErr.message }, { status: 400 });

  const { data: leaveReqRows, error: lrErr } = await supabase
    .from("HRMS_leave_requests")
    .select("leave_type_id, start_date, end_date, total_days")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", session.id)
    .eq("status", "approved");
  if (lrErr) return NextResponse.json({ error: lrErr.message }, { status: 400 });

  const approvedLeaves = (leaveReqRows ?? []).map((r: any) => ({
    leave_type_id: r.leave_type_id as string,
    start_date: String(r.start_date).slice(0, 10),
    end_date: String(r.end_date).slice(0, 10),
    total_days: Number(r.total_days) || 0,
  }));
  const joinStr = user?.date_of_joining ? String(user.date_of_joining).slice(0, 10) : null;
  const leaveLineCache = new Map<string, GovernmentLeavePayslipDisplay>();
  const leaveLinesFor = (periodEnd: string, periodStart: string, generatedAtIso: string) => {
    const asOf = slipBalanceAsOfYmd(periodEnd, periodStart, generatedAtIso);
    if (!leaveLineCache.has(asOf)) {
      const rows = computeLeaveBalanceRows((policyRows ?? []) as any[], approvedLeaves, joinStr, asOf);
      leaveLineCache.set(asOf, formatGovernmentLeavePayslipDisplay(rows));
    }
    return leaveLineCache.get(asOf)!;
  };

  return NextResponse.json({
    company: company ? { name: company.name, address: companyAddress, logoUrl } : null,
    user: user
      ? {
          name: user.name ?? "",
          employeeCode: user.employee_code ?? "",
          designation: user.designation ?? "",
          departmentName: deptRow?.name ?? "",
          dateOfJoining: user.date_of_joining ? String(user.date_of_joining) : "",
          aadhaar: user.aadhaar ?? "",
          pan: user.pan ?? "",
          uanNumber: user.uan_number ?? "",
          pfNumber: user.pf_number ?? "",
          esicNumber: user.esic_number ?? "",
          governmentPayLevel: (user as { government_pay_level?: number | null }).government_pay_level ?? null,
        }
      : null,
    payslips: (slipData ?? []).map((p: any) => {
      const period = periodsById.get(p.payroll_period_id);
      const periodStart = period?.period_start ? String(period.period_start) : "";
      const periodEnd = period?.period_end ? String(period.period_end) : "";
      const periodFormatted = periodStart && periodEnd ? `${fmtDate(periodStart)} - ${fmtDate(periodEnd)}` : "";
      const periodMonth = periodStart ? periodStart.slice(0, 7) : "";
      let totalDays = 0;
      if (periodStart && periodEnd) {
        const start = new Date(periodStart);
        const end = new Date(periodEnd);
        totalDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      }
      const payDays = p.pay_days != null ? Number(p.pay_days) : 0;
      const unpaidLeaves = totalDays > 0 ? Math.max(0, totalDays - payDays) : 0;
      const gov = govByPayslipId.get(p.id as string);
      const generatedAtIso = new Date(p.generated_at).toISOString();
      const leavePayslip = gov ? leaveLinesFor(periodEnd, periodStart, generatedAtIso) : null;
      return {
        id: p.id as string,
        payrollPeriodId: p.payroll_period_id as string,
        payrollMode: (p.payroll_mode as string | undefined) || "private",
        netPay: p.net_pay,
        grossPay: p.gross_pay,
        payDays,
        unpaidLeaves,
        basic: Number(p.basic) ?? 0,
        hra: Number(p.hra) ?? 0,
        allowances: Number(p.allowances) ?? 0,
        medical: Number(p.medical) ?? 0,
        trans: Number(p.trans) ?? 0,
        lta: Number(p.lta) ?? 0,
        personal: Number(p.personal) ?? 0,
        deductions: Number(p.deductions) ?? 0,
        pfEmployee: Number(p.pf_employee) ?? 0,
        esicEmployee: Number(p.esic_employee) ?? 0,
        professionalTax: Number(p.professional_tax) ?? 0,
        incentive: Number(p.incentive) ?? 0,
        prBonus: Number(p.pr_bonus) ?? 0,
        reimbursement: Number(p.reimbursement) ?? 0,
        tds: Number(p.tds) ?? 0,
        currency: p.currency as string,
        payslipNumber: p.payslip_number as string | null,
        generatedAt: generatedAtIso,
        bankName: (p.bank_name ?? "") as string,
        bankAccountNumber: (p.bank_account_number ?? "") as string,
        bankIfsc: (p.bank_ifsc ?? "") as string,
        periodStart,
        periodEnd,
        periodName: period?.period_name ?? "",
        periodFormatted,
        periodMonth,
        governmentMonthly: gov ?? null,
        leavePayslip,
      };
    }),
  });
}

