import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import {
  computeGovernmentMonthlyPayroll,
  deriveTransportSlabFromLevel,
  masterRowToDeductionDefaults,
} from "@/lib/governmentPayroll";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

function companyAllowsGovernmentPayroll(company: any): boolean {
  if (!company || typeof company !== "object") return false;
  const c = company as Record<string, any>;
  const type = String(c.company_type ?? c.type ?? c.payroll_type ?? c.payrollMode ?? "").toLowerCase();
  if (c.is_government === true || c.isGovernment === true) return true;
  if (c.government_payroll_enabled === true || c.governmentPayrollEnabled === true) return true;
  if (type === "government" || type === "govt") return true;
  return false;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ masters: [] });

  const { data: masters } = await supabase
    .from("HRMS_payroll_master")
    .select("*")
    .eq("company_id", me.company_id)
    .is("effective_end_date", null);
  if (!masters?.length) return NextResponse.json({ masters: [] });

  const userIds = [...new Set((masters ?? []).map((m: any) => m.employee_user_id))];
  const { data: users } = await supabase
    .from("HRMS_users")
    .select("id, name, email, role, government_pay_level, bank_name, bank_account_number, bank_ifsc")
    .in("id", userIds);
  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  const list = masters
    .filter((m: any) => {
      const u = userMap.get(m.employee_user_id);
      return u && u.role !== "super_admin";
    })
    .map((m: any) => {
      const u = userMap.get(m.employee_user_id);
      return {
        employeeUserId: m.employee_user_id,
        employeeName: u?.name ?? null,
        employeeEmail: u?.email ?? "",
        governmentPayLevel: (u as { government_pay_level?: number | null })?.government_pay_level ?? null,
        bankName: (u as { bank_name?: string | null })?.bank_name ?? "",
        bankAccountNumber: (u as { bank_account_number?: string | null })?.bank_account_number ?? "",
        bankIfsc: (u as { bank_ifsc?: string | null })?.bank_ifsc ?? "",
        master: {
          id: m.id,
          payrollMode: (m.payroll_mode as string) || "private",
          grossSalary: m.gross_salary,
          grossBasic: m.gross_basic != null ? Number(m.gross_basic) : null,
          daPercent: m.da_percent != null ? Number(m.da_percent) : 53,
          hraPercent: m.hra_percent != null ? Number(m.hra_percent) : 30,
          medicalFixed: m.medical_fixed != null ? Number(m.medical_fixed) : 3000,
          transportDaPercent: m.transport_da_percent != null ? Number(m.transport_da_percent) : 48.06,
          transportSlabGroup: m.transport_slab_group ?? null,
          transportBase: m.transport_base != null ? Number(m.transport_base) : null,
          ctc: m.ctc,
          pfEligible: m.pf_eligible,
          esicEligible: m.esic_eligible,
          pfEmployee: m.pf_employee,
          pfEmployer: m.pf_employer,
          esicEmployee: m.esic_employee,
          esicEmployer: m.esic_employer,
          pt: m.pt,
          tds: m.tds ?? 0,
          advanceBonus: m.advance_bonus ?? 0,
          takeHome: m.take_home,
          effectiveStartDate: m.effective_start_date,
          basic: m.basic ?? 0,
          hra: m.hra ?? 0,
          medical: m.medical ?? 0,
          trans: m.trans ?? 0,
          lta: m.lta ?? 0,
          personal: m.personal ?? 0,
          incomeTaxDefault: m.income_tax_default != null ? Number(m.income_tax_default) : 0,
          ptDefault: m.pt_default != null ? Number(m.pt_default) : 200,
          licDefault: m.lic_default != null ? Number(m.lic_default) : 0,
          cpfDefault: m.cpf_default != null ? Number(m.cpf_default) : 0,
          daCpfDefault: m.da_cpf_default != null ? Number(m.da_cpf_default) : 0,
          vpfDefault: m.vpf_default != null ? Number(m.vpf_default) : 0,
          pfLoanDefault: m.pf_loan_default != null ? Number(m.pf_loan_default) : 0,
          postOfficeDefault: m.post_office_default != null ? Number(m.post_office_default) : 0,
          creditSocietyDefault: m.credit_society_default != null ? Number(m.credit_society_default) : 0,
          stdLicenceFeeDefault: m.std_licence_fee_default != null ? Number(m.std_licence_fee_default) : 0,
          electricityDefault: m.electricity_default != null ? Number(m.electricity_default) : 0,
          waterDefault: m.water_default != null ? Number(m.water_default) : 0,
          messDefault: m.mess_default != null ? Number(m.mess_default) : 0,
          horticultureDefault: m.horticulture_default != null ? Number(m.horticulture_default) : 0,
          welfareDefault: m.welfare_default != null ? Number(m.welfare_default) : 0,
          vehChargeDefault: m.veh_charge_default != null ? Number(m.veh_charge_default) : 0,
          otherDeductionDefault: m.other_deduction_default != null ? Number(m.other_deduction_default) : 0,
        },
      };
    });

  return NextResponse.json({ masters: list });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.employeeUserId === "string" ? body.employeeUserId : "";
  const payrollMode = body?.payrollMode === "government" ? "government" : "private";
  let grossSalary = body?.grossSalary != null ? Number(body.grossSalary) : 0;
  const pfEligible = body?.pfEligible === true;
  const esicEligible = body?.esicEligible === true;
  const effectiveStartDate = typeof body?.effectiveStartDate === "string" ? body.effectiveStartDate : "";
  let reasonForChange = typeof body?.reasonForChange === "string" ? body.reasonForChange.trim() : "";
  if (!reasonForChange && isSuperAdmin(session.role)) {
    reasonForChange = "Payroll master update";
  }

  const ptOverride = body?.pt != null ? Math.max(0, Number(body.pt)) : null;
  const tdsVal = body?.tds != null ? Math.max(0, Number(body.tds)) : 0;
  const advanceBonusVal = body?.advanceBonus != null ? Math.max(0, Number(body.advanceBonus)) : 0;

  // Optional salary component breakdown (Basic, HRA, Medical, Trans, LTA, Personal)
  const basic = body?.basic != null ? Number(body.basic) : 0;
  const hra = body?.hra != null ? Number(body.hra) : 0;
  const medical = body?.medical != null ? Number(body.medical) : 0;
  const trans = body?.trans != null ? Number(body.trans) : 0;
  const lta = body?.lta != null ? Number(body.lta) : 0;
  const personal = body?.personal != null ? Number(body.personal) : 0;
  const componentsSum = basic + hra + medical + trans + lta + personal;
  if (componentsSum > 0) grossSalary = componentsSum;

  const updateBankOnly = body?.updateBankOnly === true;
  if (updateBankOnly) {
    const { data: meB, error: meBErr } = await supabase
      .from("HRMS_users")
      .select("company_id")
      .eq("id", session.id)
      .maybeSingle();
    if (meBErr) return NextResponse.json({ error: meBErr.message }, { status: 400 });
    if (!meB?.company_id) return NextResponse.json({ error: "No company" }, { status: 400 });
    if (!userId) return NextResponse.json({ error: "employeeUserId is required" }, { status: 400 });

    const { data: targetB } = await supabase
      .from("HRMS_users")
      .select("id, company_id, employment_status")
      .eq("id", userId)
      .single();
    if (!targetB || targetB.company_id !== meB.company_id || targetB.employment_status !== "current") {
      return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
    }

    const bankName = typeof body?.bankName === "string" ? body.bankName.trim() : "";
    const bankAccountNumber = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";
    const bankIfsc = typeof body?.bankIfsc === "string" ? body.bankIfsc.trim().toUpperCase() : "";

    const { error: bankErr } = await supabase
      .from("HRMS_users")
      .update({
        bank_name: bankName || null,
        bank_account_number: bankAccountNumber || null,
        bank_ifsc: bankIfsc || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("company_id", meB.company_id);
    if (bankErr) return NextResponse.json({ error: bankErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!userId || !effectiveStartDate) {
    return NextResponse.json({ error: "employeeUserId and effectiveStartDate are required" }, { status: 400 });
  }
  if (!reasonForChange) {
    return NextResponse.json({ error: "reasonForChange is required" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "No company" }, { status: 400 });

  // Company-level constraint: only government-type companies can save government payroll masters.
  if (payrollMode === "government") {
    const { data: companyRow } = await supabase.from("HRMS_companies").select("*").eq("id", me.company_id).maybeSingle();
    if (!companyAllowsGovernmentPayroll(companyRow)) {
      return NextResponse.json(
        { error: "This company is not configured for government payroll. Use private payroll." },
        { status: 400 },
      );
    }
  }

  const { data: target } = await supabase
    .from("HRMS_users")
    .select("id, company_id, employment_status, government_pay_level")
    .eq("id", userId)
    .single();
  if (!target || target.company_id !== me.company_id || target.employment_status !== "current") {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const { data: oldMaster } = await supabase
    .from("HRMS_payroll_master")
    .select("id")
    .eq("employee_user_id", userId)
    .is("effective_end_date", null)
    .maybeSingle();

  if (oldMaster) {
    const d = new Date(effectiveStartDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const prevDay = d.toISOString().slice(0, 10);
    await supabase
      .from("HRMS_payroll_master")
      .update({ effective_end_date: prevDay })
      .eq("id", oldMaster.id);
  }

  if (payrollMode === "government") {
    if (target.government_pay_level == null) {
      return NextResponse.json(
        { error: "Set Government pay level on the employee profile before saving government payroll master." },
        { status: 400 },
      );
    }
    const grossBasic = body?.grossBasic != null ? Number(body.grossBasic) : 0;
    if (!Number.isFinite(grossBasic) || grossBasic <= 0) {
      return NextResponse.json({ error: "grossBasic (monthly) is required for government payroll" }, { status: 400 });
    }
    const daPercent = body?.daPercent != null ? Number(body.daPercent) : 53;
    const hraPercent = body?.hraPercent != null ? Number(body.hraPercent) : 30;
    const medicalFixed = body?.medicalFixed != null ? Number(body.medicalFixed) : 3000;
    const transportDaPercent = body?.transportDaPercent != null ? Number(body.transportDaPercent) : 48.06;
    const govPfEligible = body?.pfEligible !== false;

    const slab = deriveTransportSlabFromLevel(target.government_pay_level);
    const ded = {
      income_tax_default: body?.incomeTaxDefault != null ? Number(body.incomeTaxDefault) : tdsVal,
      pt_default: body?.ptDefault != null ? Number(body.ptDefault) : 200,
      lic_default: body?.licDefault != null ? Number(body.licDefault) : 0,
      cpf_default: body?.cpfDefault != null ? Number(body.cpfDefault) : 0,
      da_cpf_default: body?.daCpfDefault != null ? Number(body.daCpfDefault) : 0,
      vpf_default: body?.vpfDefault != null ? Number(body.vpfDefault) : 0,
      pf_loan_default: body?.pfLoanDefault != null ? Number(body.pfLoanDefault) : 0,
      post_office_default: body?.postOfficeDefault != null ? Number(body.postOfficeDefault) : 0,
      credit_society_default: body?.creditSocietyDefault != null ? Number(body.creditSocietyDefault) : 0,
      std_licence_fee_default: body?.stdLicenceFeeDefault != null ? Number(body.stdLicenceFeeDefault) : 0,
      electricity_default: body?.electricityDefault != null ? Number(body.electricityDefault) : 0,
      water_default: body?.waterDefault != null ? Number(body.waterDefault) : 0,
      mess_default: body?.messDefault != null ? Number(body.messDefault) : 0,
      horticulture_default: body?.horticultureDefault != null ? Number(body.horticultureDefault) : 0,
      welfare_default: body?.welfareDefault != null ? Number(body.welfareDefault) : 0,
      veh_charge_default: body?.vehChargeDefault != null ? Number(body.vehChargeDefault) : 0,
      other_deduction_default: body?.otherDeductionDefault != null ? Number(body.otherDeductionDefault) : 0,
    };

    const preview = computeGovernmentMonthlyPayroll({
      grossBasic,
      daPercent,
      hraPercent,
      medicalFixed,
      transportDaPercent,
      payLevel: target.government_pay_level,
      daysInMonth: 30,
      unpaidDays: 0,
      deductionDefaults: masterRowToDeductionDefaults(ded),
    });

    await supabase.from("HRMS_payroll_master").insert([
      {
        company_id: me.company_id,
        employee_user_id: userId,
        payroll_mode: "government",
        gross_basic: grossBasic,
        gross_salary: grossBasic,
        da_percent: daPercent,
        hra_percent: hraPercent,
        medical_fixed: medicalFixed,
        transport_da_percent: transportDaPercent,
        transport_slab_group: slab.transportSlabGroup,
        transport_base: slab.transportBase,
        ...ded,
        pf_eligible: govPfEligible,
        esic_eligible: false,
        pf_employee: 0,
        pf_employer: 0,
        esic_employee: 0,
        esic_employer: 0,
        pt: ded.pt_default,
        tds: tdsVal,
        advance_bonus: advanceBonusVal,
        take_home: preview.netSalary,
        ctc: grossBasic,
        basic: preview.basicPaid,
        hra: preview.hraPaid,
        medical: preview.medicalPaid,
        trans: preview.transportPaid,
        lta: 0,
        personal: 0,
        effective_start_date: effectiveStartDate,
        effective_end_date: null,
        reason_for_change: reasonForChange,
        created_by: session.id,
      },
    ]);

    await supabase
      .from("HRMS_users")
      .update({
        ctc: grossBasic,
        gross_salary: grossBasic,
        pf_eligible: govPfEligible,
        esic_eligible: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return NextResponse.json({ ok: true });
  }

  const { data: company } = await supabase
    .from("HRMS_companies")
    .select("professional_tax_monthly")
    .eq("id", me.company_id)
    .single();
  const companyPt = company?.professional_tax_monthly != null ? Number(company.professional_tax_monthly) : 200;
  const ptMonthly = ptOverride != null && Number.isFinite(ptOverride) ? ptOverride : companyPt;

  const salaryBreakup = componentsSum > 0
    ? { basic, hra, medical, trans, lta, personal }
    : undefined;
  const calc = (await import("@/lib/payrollCalc")).computePayrollFromGross(
    grossSalary,
    pfEligible,
    esicEligible,
    ptMonthly,
    salaryBreakup
  );
  const { pfEmp, pfEmpr, esicEmp, esicEmpr, ctc, takeHome: baseTakeHome, basic: calcBasic, hra: calcHra, medical: calcMedical, trans: calcTrans, lta: calcLta, personal: calcPersonal } = calc;
  const takeHome = Math.max(0, baseTakeHome - tdsVal + advanceBonusVal);

  const salaryComponents = {
    basic: calcBasic,
    hra: calcHra,
    medical: calcMedical,
    trans: calcTrans,
    lta: calcLta,
    personal: calcPersonal,
  };

  await supabase.from("HRMS_payroll_master").insert([
    {
      company_id: me.company_id,
      employee_user_id: userId,
      payroll_mode: "private",
      gross_salary: grossSalary,
      ctc,
      pf_eligible: pfEligible,
      esic_eligible: esicEligible,
      pf_employee: pfEmp,
      pf_employer: pfEmpr,
      esic_employee: esicEmp,
      esic_employer: esicEmpr,
      pt: ptMonthly,
      tds: tdsVal,
      advance_bonus: advanceBonusVal,
      take_home: takeHome,
      effective_start_date: effectiveStartDate,
      effective_end_date: null,
      reason_for_change: reasonForChange,
      created_by: session.id,
      ...salaryComponents,
    },
  ]);

  await supabase
    .from("HRMS_users")
    .update({ ctc, gross_salary: grossSalary, pf_eligible: pfEligible, esic_eligible: esicEligible, updated_at: new Date().toISOString() })
    .eq("id", userId);

  return NextResponse.json({ ok: true });
}
