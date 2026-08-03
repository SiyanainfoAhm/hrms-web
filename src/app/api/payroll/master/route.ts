import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { normalizeIndianIfsc, validateIndianBankAccountNumber, validateIndianIfsc } from "@/lib/bankValidators";
import {
  computeGovernmentMonthlyPayroll,
  deriveTransportSlabFromLevel,
  masterRowToDeductionDefaults,
} from "@/lib/governmentPayroll";
import { computeProfessionalTaxMonthly, normalizePrivatePayrollConfig } from "@/lib/payrollConfig";
import { statutoryIdPatchFromBody } from "@/lib/payrollEligibility";
import {
  payrollMonthLabelFromYmd,
  type PayrollMasterChangeRow,
} from "@/lib/payrollMasterEmail";
import { sendPayrollMasterUpdatedEmail } from "@/services/payrollNotificationService";
import { getPublicAppUrl } from "@/lib/publicAppUrl";

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

function ymd(v: string | null | undefined): string {
  return String(v ?? "").trim().slice(0, 10);
}

function dayBeforeUtc(ymdDate: string): string {
  const d = new Date(ymd(ymdDate) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function moneyLabel(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function textLabel(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function boolLabel(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function pushMasterFieldChange(
  out: PayrollMasterChangeRow[],
  employeeName: string,
  field: string,
  previousValue: string,
  newValue: string,
) {
  if (previousValue === newValue) return;
  out.push({ employeeName, field, previousValue, newValue });
}

function buildPrivateMasterDiff(
  employeeName: string,
  oldRow: Record<string, unknown> | null,
  next: {
    grossSalary: number;
    ctc: number;
    takeHome: number;
    pfEmployee: number;
    pfEmployer: number;
    esicEmployee: number;
    esicEmployer: number;
    pt: number;
    tds: number;
    advanceBonus: number;
    effectiveStartDate: string;
  },
): PayrollMasterChangeRow[] {
  const changes: PayrollMasterChangeRow[] = [];
  const old = oldRow ?? null;
  pushMasterFieldChange(changes, employeeName, "Gross", moneyLabel(old?.gross_salary), moneyLabel(next.grossSalary));
  pushMasterFieldChange(changes, employeeName, "CTC", moneyLabel(old?.ctc), moneyLabel(next.ctc));
  pushMasterFieldChange(changes, employeeName, "Take home", moneyLabel(old?.take_home), moneyLabel(next.takeHome));
  pushMasterFieldChange(changes, employeeName, "PF (employee)", moneyLabel(old?.pf_employee), moneyLabel(next.pfEmployee));
  pushMasterFieldChange(changes, employeeName, "PF (employer)", moneyLabel(old?.pf_employer), moneyLabel(next.pfEmployer));
  pushMasterFieldChange(changes, employeeName, "ESIC (employee)", moneyLabel(old?.esic_employee), moneyLabel(next.esicEmployee));
  pushMasterFieldChange(changes, employeeName, "ESIC (employer)", moneyLabel(old?.esic_employer), moneyLabel(next.esicEmployer));
  pushMasterFieldChange(changes, employeeName, "PT", moneyLabel(old?.pt), moneyLabel(next.pt));
  pushMasterFieldChange(changes, employeeName, "TDS", moneyLabel(old?.tds), moneyLabel(next.tds));
  pushMasterFieldChange(changes, employeeName, "Incentive / Advance bonus", moneyLabel(old?.advance_bonus), moneyLabel(next.advanceBonus));
  pushMasterFieldChange(
    changes,
    employeeName,
    "Effective start",
    textLabel(old?.effective_start_date),
    textLabel(next.effectiveStartDate),
  );
  return changes;
}

function buildGovernmentMasterDiff(
  employeeName: string,
  oldRow: Record<string, unknown> | null,
  next: {
    grossBasic: number;
    takeHome: number;
    pt: number;
    tds: number;
    advanceBonus: number;
    effectiveStartDate: string;
  },
): PayrollMasterChangeRow[] {
  const changes: PayrollMasterChangeRow[] = [];
  const old = oldRow ?? null;
  pushMasterFieldChange(
    changes,
    employeeName,
    "Gross basic",
    moneyLabel(old?.gross_basic ?? old?.gross_salary),
    moneyLabel(next.grossBasic),
  );
  pushMasterFieldChange(changes, employeeName, "CTC / Gross", moneyLabel(old?.ctc), moneyLabel(next.grossBasic));
  pushMasterFieldChange(changes, employeeName, "Take home / Net", moneyLabel(old?.take_home), moneyLabel(next.takeHome));
  pushMasterFieldChange(changes, employeeName, "PT", moneyLabel(old?.pt), moneyLabel(next.pt));
  pushMasterFieldChange(changes, employeeName, "TDS", moneyLabel(old?.tds), moneyLabel(next.tds));
  pushMasterFieldChange(changes, employeeName, "Incentive / Advance bonus", moneyLabel(old?.advance_bonus), moneyLabel(next.advanceBonus));
  pushMasterFieldChange(
    changes,
    employeeName,
    "Effective start",
    textLabel(old?.effective_start_date),
    textLabel(next.effectiveStartDate),
  );
  return changes;
}

async function notifyPayrollMasterUpdate(args: {
  companyId: string;
  employeeUserId: string;
  employeeName: string | null;
  employeeEmail: string | null;
  updatedByName: string | null;
  updatedByEmail: string;
  effectiveStartDate: string;
  changes: PayrollMasterChangeRow[];
  newValuesSummary: string;
}): Promise<{ emailSent: boolean }> {
  try {
    const { data: companyRow } = await supabase
      .from("HRMS_companies")
      .select("name")
      .eq("id", args.companyId)
      .maybeSingle();
    const companyName =
      (companyRow as { name?: string | null } | null)?.name?.trim() ||
      "Siyana Info Solution Private Limited";
    const payrollMonth = payrollMonthLabelFromYmd(args.effectiveStartDate);
    // Always use the field-diff table; empty changes means values were unchanged.
    const hasExactDiff = true;
    const res = await sendPayrollMasterUpdatedEmail({
      companyName,
      updatedByName: args.updatedByName,
      updatedByEmail: args.updatedByEmail,
      payrollMonth,
      affectedEmployees: [
        {
          employeeName: args.employeeName || "Employee",
          employeeEmail: args.employeeEmail,
          updatedFields:
            args.changes.length > 0
              ? [...new Set(args.changes.map((c) => c.field))]
              : ["Payroll master"],
          newValuesSummary: args.newValuesSummary,
        },
      ],
      changes: args.changes,
      hasExactDiff,
      hrmsUrl: getPublicAppUrl(),
    });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("[payroll/master] HR notification failed:", res.error);
      }
      return { emailSent: false };
    }
    return { emailSent: true };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[payroll/master] HR notification error:", e);
    }
    return { emailSent: false };
  }
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const historyEmployeeId = searchParams.get("employeeUserId")?.trim() || "";
  const wantHistory =
    searchParams.get("history") === "1" ||
    searchParams.get("includeHistory") === "1" ||
    searchParams.get("includeHistory") === "true";
  if (wantHistory && historyEmployeeId) {
    const { data: target } = await supabase
      .from("HRMS_users")
      .select("id, company_id")
      .eq("id", historyEmployeeId)
      .maybeSingle();
    if (!target || target.company_id !== me.company_id) {
      return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
    }
    const { data: histRows, error: histErr } = await supabase
      .from("HRMS_payroll_master")
      .select(
        "id, payroll_mode, gross_salary, gross_basic, ctc, effective_start_date, effective_end_date, reason_for_change, created_at",
      )
      .eq("company_id", me.company_id)
      .eq("employee_user_id", historyEmployeeId)
      .order("effective_start_date", { ascending: false });
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 400 });
    return NextResponse.json({ history: histRows ?? [] });
  }

  const { data: masters } = await supabase
    .from("HRMS_payroll_master")
    .select("*")
    .eq("company_id", me.company_id)
    .is("effective_end_date", null);
  if (!masters?.length) return NextResponse.json({ masters: [] });

  const userIds = [...new Set((masters ?? []).map((m: any) => m.employee_user_id))];
  const { data: users } = await supabase
    .from("HRMS_users")
    .select("id, name, email, role, government_pay_level, bank_name, bank_account_holder_name, bank_account_number, bank_ifsc, uan_number, pf_number, cpf_number, esic_number, pf_eligible, esic_eligible")
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
        bankAccountHolderName: (u as { bank_account_holder_name?: string | null })?.bank_account_holder_name ?? "",
        bankAccountNumber: (u as { bank_account_number?: string | null })?.bank_account_number ?? "",
        bankIfsc: (u as { bank_ifsc?: string | null })?.bank_ifsc ?? "",
        uanNumber: (u as { uan_number?: string | null })?.uan_number ?? "",
        pfNumber:
          (u as { pf_number?: string | null })?.pf_number ??
          (u as { cpf_number?: string | null })?.cpf_number ??
          "",
        esicNumber: (u as { esic_number?: string | null })?.esic_number ?? "",
        pfEligible: (u as { pf_eligible?: boolean | null })?.pf_eligible !== false,
        esicEligible: (u as { esic_eligible?: boolean | null })?.esic_eligible === true,
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
    const bankAccountHolderName = typeof body?.bankAccountHolderName === "string" ? body.bankAccountHolderName.trim() : "";
    const bankAccountNumber = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.replace(/\s+/g, "").trim() : "";
    const bankIfsc = typeof body?.bankIfsc === "string" ? normalizeIndianIfsc(body.bankIfsc) : "";

    if (!bankAccountHolderName) return NextResponse.json({ error: "Account holder name is required" }, { status: 400 });
    const acctErr = bankAccountNumber ? validateIndianBankAccountNumber(bankAccountNumber) : "Bank account number is required";
    if (acctErr) return NextResponse.json({ error: acctErr }, { status: 400 });
    const ifscErr = validateIndianIfsc(bankIfsc);
    if (ifscErr) return NextResponse.json({ error: ifscErr }, { status: 400 });

    const userPatch: Record<string, string | null> = {
      bank_name: bankName || null,
      bank_account_holder_name: bankAccountHolderName || null,
      bank_account_number: bankAccountNumber || null,
      bank_ifsc: bankIfsc || null,
      updated_at: new Date().toISOString(),
      ...statutoryIdPatchFromBody(body),
    };

    const { error: bankErr } = await supabase
      .from("HRMS_users")
      .update(userPatch)
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
    .select("id, company_id, employment_status, government_pay_level, name, email")
    .eq("id", userId)
    .single();
  if (!target || target.company_id !== me.company_id || target.employment_status !== "current") {
    return NextResponse.json({ error: "Invalid employee" }, { status: 400 });
  }

  const employeeName = (target as { name?: string | null }).name ?? null;
  const employeeEmail = (target as { email?: string | null }).email ?? null;

  const { data: oldMaster } = await supabase
    .from("HRMS_payroll_master")
    .select(
      "id, effective_start_date, payroll_mode, gross_salary, gross_basic, ctc, take_home, pf_employee, pf_employer, esic_employee, esic_employer, pt, tds, advance_bonus, pf_eligible, esic_eligible",
    )
    .eq("employee_user_id", userId)
    .is("effective_end_date", null)
    .maybeSingle();

  const previousEffectiveEndDateRaw =
    typeof body?.previousEffectiveEndDate === "string" ? ymd(body.previousEffectiveEndDate) : "";

  if (oldMaster) {
    const oldStart = ymd(oldMaster.effective_start_date as string | null);
    if (oldStart && ymd(effectiveStartDate) <= oldStart) {
      return NextResponse.json(
        {
          error:
            "New effective start date must be after the current payroll master’s start date. Close the previous row with an effective end on or after that start, before the new start (e.g. old ends 31 May, new starts 1 June).",
        },
        { status: 400 },
      );
    }

    let endDateToSet: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(previousEffectiveEndDateRaw)) {
      endDateToSet = previousEffectiveEndDateRaw;
      if (endDateToSet >= ymd(effectiveStartDate)) {
        return NextResponse.json(
          { error: "Effective end date for the previous master must be strictly before the new effective start date." },
          { status: 400 },
        );
      }
      if (oldStart && endDateToSet < oldStart) {
        return NextResponse.json(
          { error: "Effective end date for the previous master cannot be before that row’s effective start date." },
          { status: 400 },
        );
      }
    } else {
      const prevDay = dayBeforeUtc(effectiveStartDate);
      if (!prevDay) {
        return NextResponse.json({ error: "Invalid effective start date" }, { status: 400 });
      }
      endDateToSet = prevDay;
      if (oldStart && endDateToSet < oldStart) {
        return NextResponse.json(
          {
            error:
              "Computed end date for the previous master would be before its start. Choose a later new effective start date or set an explicit previous effective end date.",
          },
          { status: 400 },
        );
      }
    }

    await supabase.from("HRMS_payroll_master").update({ effective_end_date: endDateToSet }).eq("id", oldMaster.id);
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

    const { error: govInsErr } = await supabase.from("HRMS_payroll_master").insert([
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
    if (govInsErr) return NextResponse.json({ error: govInsErr.message }, { status: 400 });

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

    const changes = buildGovernmentMasterDiff(employeeName || "Employee", (oldMaster as any) ?? null, {
      grossBasic,
      takeHome: preview.netSalary,
      pt: ded.pt_default,
      tds: tdsVal,
      advanceBonus: advanceBonusVal,
      effectiveStartDate,
    });
    const { emailSent } = await notifyPayrollMasterUpdate({
      companyId: me.company_id,
      employeeUserId: userId,
      employeeName,
      employeeEmail,
      updatedByName: session.name,
      updatedByEmail: session.email,
      effectiveStartDate,
      changes,
      newValuesSummary: `Gross ${moneyLabel(grossBasic)}, Net ${moneyLabel(preview.netSalary)}, PT ${moneyLabel(ded.pt_default)}, TDS ${moneyLabel(tdsVal)}`,
    });

    return NextResponse.json({ ok: true, emailSent });
  }

  const { data: company } = await supabase
    .from("HRMS_companies")
    .select("professional_tax_monthly")
    .eq("id", me.company_id)
    .single();
  const companyPt = company?.professional_tax_monthly != null ? Number(company.professional_tax_monthly) : 200;
  const ptMonthlyFallback = ptOverride != null && Number.isFinite(ptOverride) ? ptOverride : companyPt;

  let privateCfg = normalizePrivatePayrollConfig(null);
  try {
    const { data: cfgRow } = await supabase
      .from("HRMS_company_payroll_config")
      .select("private_config")
      .eq("company_id", me.company_id)
      .maybeSingle();
    privateCfg = normalizePrivatePayrollConfig((cfgRow as { private_config?: unknown } | null)?.private_config);
  } catch {
    // ignore
  }

  const salaryBreakup = componentsSum > 0
    ? { basic, hra, medical, trans, lta, personal }
    : undefined;
  const inputCtc = body?.ctc != null && Number.isFinite(Number(body.ctc)) ? Math.max(0, Number(body.ctc)) : null;
  const calcLib = await import("@/lib/payrollCalc");
  const ptFromGross = (g: number) => computeProfessionalTaxMonthly(g, privateCfg, ptMonthlyFallback);
  const grossRoundedInitial = Math.max(0, Math.round(Number(grossSalary) || 0));
  const ptForGrossPath = computeProfessionalTaxMonthly(grossRoundedInitial, privateCfg, ptMonthlyFallback);

  const calc =
    inputCtc != null && inputCtc > 0
      ? calcLib.computePayrollFromCtc(inputCtc, pfEligible, esicEligible, ptFromGross, salaryBreakup, privateCfg)
      : calcLib.computePayrollFromGross(grossSalary, pfEligible, esicEligible, ptForGrossPath, salaryBreakup, privateCfg);
  const { pfEmp, pfEmpr, esicEmp, esicEmpr, ctc, takeHome: baseTakeHome, basic: calcBasic, hra: calcHra, medical: calcMedical, trans: calcTrans, lta: calcLta, personal: calcPersonal } = calc;
  const takeHome = Math.max(0, baseTakeHome - tdsVal + advanceBonusVal);
  if (inputCtc != null && inputCtc > 0 && (calc as { gross?: number }).gross != null) {
    grossSalary = Number((calc as { gross?: number }).gross) || grossSalary;
  }

  const grossFinal = Math.max(0, Math.round(Number(grossSalary) || 0));
  const ptStored = computeProfessionalTaxMonthly(grossFinal, privateCfg, ptMonthlyFallback);

  const salaryComponents = {
    basic: calcBasic,
    hra: calcHra,
    medical: calcMedical,
    trans: calcTrans,
    lta: calcLta,
    personal: calcPersonal,
  };

  const { error: privInsErr } = await supabase.from("HRMS_payroll_master").insert([
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
      pt: ptStored,
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
  if (privInsErr) return NextResponse.json({ error: privInsErr.message }, { status: 400 });

  await supabase
    .from("HRMS_users")
    .update({
      ctc,
      gross_salary: grossSalary,
      pf_eligible: pfEligible,
      esic_eligible: esicEligible,
      updated_at: new Date().toISOString(),
      ...statutoryIdPatchFromBody(body),
    })
    .eq("id", userId);

  const changes = buildPrivateMasterDiff(employeeName || "Employee", (oldMaster as any) ?? null, {
    grossSalary,
    ctc,
    takeHome,
    pfEmployee: pfEmp,
    pfEmployer: pfEmpr,
    esicEmployee: esicEmp,
    esicEmployer: esicEmpr,
    pt: ptStored,
    tds: tdsVal,
    advanceBonus: advanceBonusVal,
    effectiveStartDate,
  });
  // Include eligibility flips in the diff when previous row exists.
  if (oldMaster) {
    pushMasterFieldChange(
      changes,
      employeeName || "Employee",
      "PF eligible",
      boolLabel((oldMaster as any).pf_eligible),
      boolLabel(pfEligible),
    );
    pushMasterFieldChange(
      changes,
      employeeName || "Employee",
      "ESIC eligible",
      boolLabel((oldMaster as any).esic_eligible),
      boolLabel(esicEligible),
    );
  }

  const { emailSent } = await notifyPayrollMasterUpdate({
    companyId: me.company_id,
    employeeUserId: userId,
    employeeName,
    employeeEmail,
    updatedByName: session.name,
    updatedByEmail: session.email,
    effectiveStartDate,
    changes,
    newValuesSummary: `CTC ${moneyLabel(ctc)}, Gross ${moneyLabel(grossSalary)}, Take home ${moneyLabel(takeHome)}, PF ${moneyLabel(pfEmp)}, ESIC ${moneyLabel(esicEmp)}, PT ${moneyLabel(ptStored)}, TDS ${moneyLabel(tdsVal)}`,
  });

  return NextResponse.json({ ok: true, emailSent });
}
