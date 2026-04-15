import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { overlapDaysInclusive } from "@/lib/leavePolicy";
import { effectiveLunchBreakMinutes } from "@/lib/attendancePolicy";
import {
  computeGovernmentMonthlyPayroll,
  masterRowToDeductionDefaults,
  type GovernmentDeductionDefaults,
  type GovernmentEarningPaidOverrides,
  type GovernmentOptionalMonthlyEarnings,
} from "@/lib/governmentPayroll";
import {
  buildPayrollExcelRow,
  PAYROLL_EXCEL_HEADER,
  payrollExcelAmountColumnIndices,
} from "@/lib/payrollExcelExport";
import { computePayrollFromGross } from "@/lib/payrollCalc";
import { normalizePrivatePayrollConfig, type PrivatePayrollConfig } from "@/lib/payrollConfig";
import { computeLeaveBalanceRows } from "@/lib/leaveBalancesCompute";
import * as XLSX from "xlsx-js-style";

function ymd(v: string): string {
  return String(v ?? "").slice(0, 10);
}

async function fetchCompanyPrivatePayrollConfig(companyId: string): Promise<PrivatePayrollConfig> {
  try {
    const { data: cfgRow } = await supabase
      .from("HRMS_company_payroll_config")
      .select("private_config")
      .eq("company_id", companyId)
      .maybeSingle();
    return normalizePrivatePayrollConfig((cfgRow as any)?.private_config);
  } catch {
    return normalizePrivatePayrollConfig(null);
  }
}

function isExplicitlyTrue(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "t" || v === "TRUE" || v === "1";
}

function isExplicitlyFalse(v: unknown): boolean {
  return v === false || v === 0 || v === "false" || v === "f" || v === "FALSE" || v === "0";
}

/** Prefer payroll master flags; fall back to employee (`HRMS_users`) so Run matches Payroll Master when master columns are null. */
function privatePfEligibleMerged(m: Record<string, any>, u?: Record<string, any> | null): boolean {
  if (isExplicitlyFalse(m.pf_eligible)) return false;
  if (isExplicitlyTrue(m.pf_eligible)) return true;
  if (u) {
    if (isExplicitlyFalse(u.pf_eligible)) return false;
    if (isExplicitlyTrue(u.pf_eligible)) return true;
  }
  return true;
}

function privateEsicEligibleMerged(m: Record<string, any>, u?: Record<string, any> | null): boolean {
  if (isExplicitlyTrue(m.esic_eligible)) return true;
  if (isExplicitlyFalse(m.esic_eligible)) return false;
  if (u && isExplicitlyTrue(u.esic_eligible)) return true;
  return false;
}

/** Full-month PF/ESIC/CTC from gross + flags + breakup (aligned with Payroll Master). */
function privateStatutoryMonthlyFromMaster(
  m: Record<string, any>,
  profTaxMonthlyRounded: number,
  privateCfg: PrivatePayrollConfig,
  user?: Record<string, any> | null,
): { pfEmp: number; pfEmpr: number; esicEmp: number; esicEmpr: number; ctc: number } {
  const grossMonthly = Number(m.gross_salary) || 0;
  if (grossMonthly <= 0) return { pfEmp: 0, pfEmpr: 0, esicEmp: 0, esicEmpr: 0, ctc: 0 };
  const mb = Number(m.basic) || 0;
  const mh = Number(m.hra) || 0;
  const mm = Number(m.medical) || 0;
  const mt = Number(m.trans) || 0;
  const ml = Number(m.lta) || 0;
  const mp = Number(m.personal) || 0;
  const componentsSum = mb + mh + mm + mt + ml + mp;
  const salaryBreakup =
    componentsSum > 0 ? { basic: mb, hra: mh, medical: mm, trans: mt, lta: ml, personal: mp } : undefined;
  const calc = computePayrollFromGross(
    grossMonthly,
    privatePfEligibleMerged(m, user),
    privateEsicEligibleMerged(m, user),
    profTaxMonthlyRounded,
    salaryBreakup,
    privateCfg,
  );
  return {
    pfEmp: calc.pfEmp,
    pfEmpr: calc.pfEmpr,
    esicEmp: calc.esicEmp,
    esicEmpr: calc.esicEmpr,
    ctc: calc.ctc,
  };
}

/**
 * Pick latest applicable payroll master per employee for a period.
 * Fixes: employee has April master but should still appear in May payroll.
 */
async function fetchApplicablePayrollMasters(companyId: string, periodStart: string, periodEnd: string) {
  const start = ymd(periodStart);
  const end = ymd(periodEnd);
  // Query broadly, then filter deterministically in JS (Supabase `.or()` chaining can be tricky).
  const { data, error } = await supabase
    .from("HRMS_payroll_master")
    .select(
      "id, employee_user_id, payroll_mode, gross_salary, gross_basic, ctc, pf_employee, pf_employer, esic_employee, esic_employer, pf_eligible, esic_eligible, basic, hra, medical, trans, lta, personal, pt, tds, advance_bonus, da_percent, hra_percent, medical_fixed, transport_da_percent, income_tax_default, pt_default, lic_default, cpf_default, da_cpf_default, vpf_default, pf_loan_default, post_office_default, credit_society_default, std_licence_fee_default, electricity_default, water_default, mess_default, horticulture_default, welfare_default, veh_charge_default, other_deduction_default, effective_start_date, effective_end_date",
    )
    .eq("company_id", companyId)
    // At least not ended before the period starts (or open-ended).
    .or(`effective_end_date.is.null,effective_end_date.gte.${start}`);
  if (error) throw new Error(error.message);
  const raw = (data ?? []) as any[];
  const rows = raw.filter((r) => {
    const s = ymd(r.effective_start_date || "0000-01-01");
    const e = r.effective_end_date ? ymd(r.effective_end_date) : null;
    // Include if started on/before period end (or start missing) AND not ended before period start.
    if (s > end) return false;
    if (e && e < start) return false;
    return true;
  });
  if (!rows.length) return [];

  const byUser = new Map<string, any>();
  for (const r of rows) {
    const uid = r.employee_user_id as string | null;
    if (!uid) continue;
    const prev = byUser.get(uid);
    const curStart = ymd(r.effective_start_date || "0000-01-01");
    const prevStart = prev ? ymd(prev.effective_start_date || "0000-01-01") : "";
    if (!prev || curStart > prevStart) byUser.set(uid, r);
  }
  return [...byUser.values()];
}

/** Merge payroll-master defaults with admin-edited preview values from the Run Payroll UI. */
function deductionDefaultsForGovernmentRun(
  master: Record<string, unknown>,
  clientDefaults: unknown,
): GovernmentDeductionDefaults {
  const base = masterRowToDeductionDefaults(master);
  if (!clientDefaults || typeof clientDefaults !== "object") return base;
  const c = clientDefaults as Record<string, unknown>;
  const result: GovernmentDeductionDefaults = { ...base };
  for (const key of Object.keys(result) as (keyof GovernmentDeductionDefaults)[]) {
    const v = c[key as string];
    if (v != null && Number.isFinite(Number(v))) {
      result[key] = Math.max(0, Math.round(Number(v))) as GovernmentDeductionDefaults[typeof key];
    }
  }
  return result;
}

const GOV_EARNING_OVERRIDE_KEYS = [
  "basicPaid",
  "spPayPaid",
  "daPaid",
  "transportPaid",
  "hraPaid",
  "medicalPaid",
  "extraWorkAllowancePaid",
  "nightAllowancePaid",
  "uniformAllowancePaid",
  "educationAllowancePaid",
  "daArrearsPaid",
  "transportArrearsPaid",
  "encashmentPaid",
  "encashmentDaPaid",
] as const;

function governmentEarningPaidOverridesFromBody(raw: unknown): GovernmentEarningPaidOverrides | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: GovernmentEarningPaidOverrides = {};
  for (const k of GOV_EARNING_OVERRIDE_KEYS) {
    const v = o[k];
    if (v != null && Number.isFinite(Number(v))) {
      out[k] = Math.max(0, Math.round(Number(v)));
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function optionalEarningsFromClientGovernmentMonthly(gm: unknown): GovernmentOptionalMonthlyEarnings | undefined {
  if (!gm || typeof gm !== "object") return undefined;
  const g = gm as Record<string, unknown>;
  const spPay = Number(g.spPayPaid) || 0;
  const extraWorkAllowance = Number(g.extraWorkAllowancePaid) || 0;
  const nightAllowance = Number(g.nightAllowancePaid) || 0;
  const uniformAllowance = Number(g.uniformAllowancePaid) || 0;
  const educationAllowance = Number(g.educationAllowancePaid) || 0;
  const daArrears = Number(g.daArrearsPaid) || 0;
  const transportArrears = Number(g.transportArrearsPaid) || 0;
  const encashment = Number(g.encashmentPaid) || 0;
  const encashmentDa = Number(g.encashmentDaPaid) || 0;
  if (
    !spPay &&
    !extraWorkAllowance &&
    !nightAllowance &&
    !uniformAllowance &&
    !educationAllowance &&
    !daArrears &&
    !transportArrears &&
    !encashment &&
    !encashmentDa
  ) {
    return undefined;
  }
  return {
    spPay,
    extraWorkAllowance,
    nightAllowance,
    uniformAllowance,
    educationAllowance,
    daArrears,
    transportArrears,
    encashment,
    encashmentDa,
  };
}

/** Minimum active work hours (after lunch/tea breaks) for a day to count as present in payroll. */
const MIN_ACTIVE_HOURS_FOR_PRESENT = 8;
/** Minimum active work hours for a half day to count. */
const MIN_ACTIVE_HOURS_FOR_HALF_DAY = 0.01;

// Removed minimum-qualifying-days gating. Pay days must reflect attendance/leave directly.

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toUtcMidnightFromYmd(ymd: string): Date {
  return new Date(String(ymd).slice(0, 10) + "T00:00:00Z");
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 0, 0, 0, 0));
}

function weekdayUtc(ymd: string): number {
  // 0=Sun ... 6=Sat
  return toUtcMidnightFromYmd(ymd).getUTCDay();
}

function isWeekdayUtc(ymd: string): boolean {
  const d = weekdayUtc(ymd);
  return d !== 0 && d !== 6;
}

function* iterateYmdInclusive(startYmd: string, endYmd: string): Generator<string> {
  let d = toUtcMidnightFromYmd(startYmd);
  const end = toUtcMidnightFromYmd(endYmd);
  while (d.getTime() <= end.getTime()) {
    yield toYmdUtc(d);
    d = addDaysUtc(d, 1);
  }
}

/**
 * Weekday company holidays in the employment window that are not already covered by
 * a weekday attendance punch or any approved leave (paid or unpaid).
 */
function countEligibleWeekdayHolidaysNotOverlapping(
  holidayDates: Set<string>,
  eligStartYmd: string,
  eligEndYmd: string,
  presentDates: Set<string> | undefined,
  leaveDates: Set<string> | undefined,
): number {
  let n = 0;
  for (const ymd of iterateYmdInclusive(eligStartYmd, eligEndYmd)) {
    if (!isWeekdayUtc(ymd)) continue;
    if (!holidayDates.has(ymd)) continue;
    if (presentDates?.has(ymd)) continue;
    if (leaveDates?.has(ymd)) continue;
    n++;
  }
  return n;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundToHalfDay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 2) / 2;
}

function countCalendarDaysInclusive(startYmd: string, endYmd: string): number {
  if (startYmd > endYmd) return 0;
  const s = toUtcMidnightFromYmd(startYmd).getTime();
  const e = toUtcMidnightFromYmd(endYmd).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Pay days, capped by eligible employment days in the period (calendar days ∩ DOJ–DOL).
 *
 * **presentDays** = calendar days (Mon–Sun) with qualifying attendance; weekend work counts when punched.
 * **holidayPayDays** = weekday company holidays in the period not already covered by present or leave.
 *
 * Formula: present + paid leave + holiday pay days − unpaid leave.
 */
function resolvePayDaysFromAttendance(args: {
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  /** Max payable days in window (calendar days ∩ employment). */
  eligibleDays: number;
  holidayPayDays?: number;
}): number {
  const { presentDays, paidLeaveDays, unpaidLeaveDays, eligibleDays, holidayPayDays = 0 } = args;
  const cap = Math.max(0, eligibleDays);
  return clamp(
    roundToHalfDay(presentDays + paidLeaveDays + holidayPayDays - unpaidLeaveDays),
    0,
    cap,
  );
}

/** Company holidays (single or multi-day) that fall inside [rangeStartYmd, rangeEndYmd]. */
async function loadCompanyHolidayDateSet(
  companyId: string,
  rangeStartYmd: string,
  rangeEndYmd: string
): Promise<Set<string>> {
  const set = new Set<string>();
  const { data, error } = await supabase
    .from("HRMS_holidays")
    .select("holiday_date, holiday_end_date")
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  for (const h of data ?? []) {
    const start = String((h as any).holiday_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const endRaw = (h as any).holiday_end_date != null ? String((h as any).holiday_end_date).slice(0, 10) : start;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) && endRaw >= start ? endRaw : start;
    for (const ymd of iterateYmdInclusive(start, end)) {
      if (ymd >= rangeStartYmd && ymd <= rangeEndYmd) set.add(ymd);
    }
  }
  return set;
}

async function loadPaidLeaveRemainingByUser(args: {
  companyId: string;
  userIds: string[];
  joinDateByUserId: Map<string, string | null>;
  asOfYmd: string;
}): Promise<Map<string, number>> {
  const { companyId, userIds, joinDateByUserId, asOfYmd } = args;
  const asOf = new Date(asOfYmd + "T00:00:00Z");

  const { data: policies, error: polErr } = await supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code, payslip_slot)")
    .eq("company_id", companyId);
  if (polErr) throw new Error(polErr.message);

  // Use ANY paid leave policy (not only EL) to cover short/unpaid days.
  const paidPolicies = (policies ?? []).filter((p: any) => {
    const t = Array.isArray(p.HRMS_leave_types) ? p.HRMS_leave_types[0] : p.HRMS_leave_types;
    return t?.is_paid === true;
  });
  if (!paidPolicies.length) return new Map();

  const policyRows = paidPolicies.map((p: any) => ({
    leave_type_id: p.leave_type_id,
    accrual_method: p.accrual_method,
    monthly_accrual_rate: p.monthly_accrual_rate,
    annual_quota: p.annual_quota,
    prorate_on_join: p.prorate_on_join,
    reset_month: p.reset_month,
    reset_day: p.reset_day,
    allow_carryover: p.allow_carryover,
    carryover_limit: p.carryover_limit,
    HRMS_leave_types: Array.isArray(p.HRMS_leave_types) ? p.HRMS_leave_types[0] : p.HRMS_leave_types,
  }));

  // Approved leaves for users for these paid leave types only.
  const paidTypeIds = new Set(policyRows.map((p: any) => p.leave_type_id));
  const { data: leaves, error: leaveErr } = await supabase
    .from("HRMS_leave_requests")
    .select("employee_user_id, leave_type_id, start_date, end_date, total_days")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .in("employee_user_id", userIds)
    .in("leave_type_id", [...paidTypeIds]);
  if (leaveErr) throw new Error(leaveErr.message);

  const approvedByUser = new Map<string, any[]>();
  for (const r of leaves ?? []) {
    const uid = (r as any).employee_user_id as string | null;
    if (!uid) continue;
    const arr = approvedByUser.get(uid) || [];
    arr.push({
      leave_type_id: (r as any).leave_type_id,
      start_date: String((r as any).start_date).slice(0, 10),
      end_date: String((r as any).end_date).slice(0, 10),
      total_days: Number((r as any).total_days) || 0,
    });
    approvedByUser.set(uid, arr);
  }

  const remainingByUser = new Map<string, number>();
  for (const uid of userIds) {
    const joinDateStr = joinDateByUserId.get(uid) ?? null;
    const rows = computeLeaveBalanceRows(policyRows as any, approvedByUser.get(uid) || [], joinDateStr, asOfYmd);
    const remaining = rows.reduce((sum, r) => sum + (Number(r.remaining) || 0), 0);
    remainingByUser.set(uid, Math.max(0, remaining));
  }
  return remainingByUser;
}

type LeaveRow = {
  employee_user_id: string | null;
  start_date: string;
  end_date: string;
  total_days: number | null;
  paid_days: number | null;
  unpaid_days: number | null;
  // Supabase nested select may return object OR array depending on relationship shape
  HRMS_leave_types?: { is_paid: boolean } | { is_paid: boolean }[] | null;
};

function computeLeavePaidUnpaidInWindow(
  leave: LeaveRow,
  windowStartYmd: string,
  windowEndExclusive: Date
): { overlapDays: number; paidDays: number; unpaidDays: number; leaveDays: Set<string> } {
  const leaveDays = new Set<string>();
  const start = new Date(String(leave.start_date).slice(0, 10) + "T00:00:00Z");
  const end = new Date(String(leave.end_date).slice(0, 10) + "T00:00:00Z");
  const windowStart = new Date(windowStartYmd + "T00:00:00Z");
  const overlap = overlapDaysInclusive(start, end, windowStart, windowEndExclusive);
  if (overlap <= 0) return { overlapDays: 0, paidDays: 0, unpaidDays: 0, leaveDays };

  const overlapStart = start.getTime() > windowStart.getTime() ? toYmdUtc(start) : windowStartYmd;
  const overlapEndInclusive = toYmdUtc(new Date(windowEndExclusive.getTime() - 24 * 60 * 60 * 1000));
  const effectiveEndInclusive =
    toUtcMidnightFromYmd(end.toISOString().slice(0, 10)).getTime() <
    toUtcMidnightFromYmd(overlapEndInclusive).getTime()
      ? toYmdUtc(end)
      : overlapEndInclusive;

  for (const ymd of iterateYmdInclusive(overlapStart, effectiveEndInclusive)) leaveDays.add(ymd);

  const ltRaw: any = (leave as any).HRMS_leave_types;
  const ltObj: any = Array.isArray(ltRaw) ? ltRaw[0] : ltRaw;
  const isPaidType = ltObj?.is_paid !== false;
  const total = Number(leave.total_days) || 1;
  const unpaid = Number(leave.unpaid_days) ?? 0;
  const unpaidInOverlap = isPaidType ? (total > 0 ? Math.round(overlap * (unpaid / total)) : 0) : overlap;
  const paidInOverlap = Math.max(0, overlap - unpaidInOverlap);
  return { overlapDays: overlap, paidDays: paidInOverlap, unpaidDays: unpaidInOverlap, leaveDays };
}

async function computeAttendanceDrivenPayDays(args: {
  companyId: string;
  userIds: string[];
  periodStartYmd: string;
  periodEndExclusive: Date;
}): Promise<{
  presentDaysByUser: Map<string, number>;
  paidLeaveDaysByUser: Map<string, number>;
  unpaidLeaveDaysByUser: Map<string, number>;
  presentDatesByUser: Map<string, Set<string>>;
  leaveDaysByUser: Map<string, Set<string>>;
  shortHoursUnpaidDaysByUser: Map<string, number>;
}> {
  const { companyId, userIds, periodStartYmd, periodEndExclusive } = args;

  // Map user -> employee_id for attendance logs
  const { data: employees, error: empErr } = await supabase
    .from("HRMS_employees")
    .select("id, user_id")
    .eq("company_id", companyId)
    .in("user_id", userIds);
  if (empErr) throw new Error(empErr.message);
  const employeeIdByUser = new Map<string, string>();
  for (const e of employees ?? []) {
    if (e?.user_id && e?.id) employeeIdByUser.set(e.user_id as string, e.id as string);
  }
  const employeeIds = [...employeeIdByUser.values()];

  // Approved leaves (paid/unpaid totals + leave day override)
  const { data: leaves, error: leaveErr } = await supabase
    .from("HRMS_leave_requests")
    .select("employee_user_id, start_date, end_date, total_days, paid_days, unpaid_days, HRMS_leave_types(is_paid)")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .in("employee_user_id", userIds);
  if (leaveErr) throw new Error(leaveErr.message);

  const paidLeaveDaysByUser = new Map<string, number>();
  const unpaidLeaveDaysByUser = new Map<string, number>();
  const leaveDaysByUser = new Map<string, Set<string>>();
  for (const lAny of (leaves ?? []) as any[]) {
    const l = lAny as LeaveRow;
    const uid = l?.employee_user_id;
    if (!uid) continue;
    const r = computeLeavePaidUnpaidInWindow(l, periodStartYmd, periodEndExclusive);
    if (r.overlapDays <= 0) continue;
    // Keep paid/unpaid days as-is; may be fractional (e.g. 0.5 HL).
    paidLeaveDaysByUser.set(uid, (paidLeaveDaysByUser.get(uid) || 0) + Number(r.paidDays || 0));
    unpaidLeaveDaysByUser.set(uid, (unpaidLeaveDaysByUser.get(uid) || 0) + Number(r.unpaidDays || 0));
    const set = leaveDaysByUser.get(uid) || new Set<string>();
    for (const d of r.leaveDays) set.add(d);
    leaveDaysByUser.set(uid, set);
  }

  const presentDaysByUser = new Map<string, number>();
  const presentDatesByUser = new Map<string, Set<string>>();
  const shortHoursUnpaidDaysByUser = new Map<string, number>();
  if (!employeeIds.length) {
    return {
      presentDaysByUser,
      paidLeaveDaysByUser,
      unpaidLeaveDaysByUser,
      presentDatesByUser,
      leaveDaysByUser,
      shortHoursUnpaidDaysByUser,
    };
  }

  const periodEndYmdInclusive = toYmdUtc(new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000));
  const { data: att, error: attErr } = await supabase
    .from("HRMS_attendance_logs")
    .select(
      "employee_id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_check_out_at, lunch_check_in_at"
    )
    .eq("company_id", companyId)
    .in("employee_id", employeeIds)
    .gte("work_date", periodStartYmd)
    .lte("work_date", periodEndYmdInclusive);
  if (attErr) throw new Error(attErr.message);

  const userIdByEmployeeId = new Map<string, string>();
  for (const [uid, eid] of employeeIdByUser.entries()) userIdByEmployeeId.set(eid, uid);

  for (const row of att ?? []) {
    const eid = row.employee_id as string | null;
    if (!eid) continue;
    const uid = userIdByEmployeeId.get(eid);
    if (!uid) continue;

    const workDate = String(row.work_date).slice(0, 10);
    const leaveSet = leaveDaysByUser.get(uid);
    if (leaveSet?.has(workDate)) continue; // leave overrides punch-based presence
    // Weekends count toward pay days when the employee has qualifying attendance that day.

    const teaMin = clamp(Number((row as any).tea_break_minutes ?? 0) || 0, 0, 24 * 60);

    let durationMinutes: number | null = null;
    const inAt = row.check_in_at ? new Date(String(row.check_in_at)) : null;
    const outAt = row.check_out_at ? new Date(String(row.check_out_at)) : null;
    if (inAt && outAt && !Number.isNaN(inAt.getTime()) && !Number.isNaN(outAt.getTime())) {
      durationMinutes = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000));
    } else if (inAt && !Number.isNaN(inAt.getTime())) {
      // If user hasn't punched out yet, approximate using current time so payroll preview/run
      // can treat a short day as 0.5 (and cover with PL if available).
      durationMinutes = Math.max(0, Math.round((Date.now() - inAt.getTime()) / 60000));
    } else if (row.total_hours != null) {
      const th = Number(row.total_hours) || 0;
      durationMinutes = Math.max(0, Math.round(th * 60));
    }
    if (durationMinutes == null) continue;

    const lunchMin = effectiveLunchBreakMinutes({
      recordedLunchMinutes: Number((row as any).lunch_break_minutes ?? 0) || 0,
      lunchCheckOutAt: (row as any).lunch_check_out_at,
      lunchCheckInAt: (row as any).lunch_check_in_at,
      grossWorkMinutes: durationMinutes,
    });
    const breakMin = lunchMin + teaMin;

    const activeMinutes = Math.max(0, durationMinutes - breakMin);
    const activeHours = activeMinutes / 60;
    if (activeHours >= MIN_ACTIVE_HOURS_FOR_PRESENT) {
      presentDaysByUser.set(uid, (presentDaysByUser.get(uid) || 0) + 1);
      const set = presentDatesByUser.get(uid) || new Set<string>();
      set.add(workDate);
      presentDatesByUser.set(uid, set);
    } else if (activeHours >= MIN_ACTIVE_HOURS_FOR_HALF_DAY) {
      // Half day: counts as 0.5 present, remaining 0.5 is treated as unpaid (can be covered by PL later).
      presentDaysByUser.set(uid, (presentDaysByUser.get(uid) || 0) + 0.5);
      shortHoursUnpaidDaysByUser.set(uid, (shortHoursUnpaidDaysByUser.get(uid) || 0) + 0.5);
      const set = presentDatesByUser.get(uid) || new Set<string>();
      set.add(workDate);
      presentDatesByUser.set(uid, set);
    }
  }

  // Weekend "sandwich" pay-days rule (non-strict):
  // - Only affects Sat/Sun inside the period.
  // - If BOTH adjacent working days (Fri and Mon) are absent (no qualifying attendance),
  //   then weekend remains unpaid.
  // - Otherwise, weekend is counted as paid.
  //
  // This matches the expectation: Fri absent but Mon present => weekend should be paid.
  for (const uid of userIds) {
    const qualifying = presentDatesByUser.get(uid) || new Set<string>();
    let weekendAdded = 0;
    for (const ymd of iterateYmdInclusive(periodStartYmd, periodEndYmdInclusive)) {
      const dow = weekdayUtc(ymd);
      if (dow !== 6 && dow !== 0) continue; // Sat/Sun only
      if (qualifying.has(ymd)) continue; // already present

      const d = toUtcMidnightFromYmd(ymd);
      const prevFri = toYmdUtc(addDaysUtc(d, dow === 6 ? -1 : -2)); // Sat->Fri, Sun->Fri
      const nextMon = toYmdUtc(addDaysUtc(d, dow === 6 ? 2 : 1)); // Sat->Mon, Sun->Mon

      const friInRange = prevFri >= periodStartYmd && prevFri <= periodEndYmdInclusive;
      const monInRange = nextMon >= periodStartYmd && nextMon <= periodEndYmdInclusive;
      const friPresent = friInRange && qualifying.has(prevFri);
      const monPresent = monInRange && qualifying.has(nextMon);

      // Non-strict sandwich: only unpaid when BOTH sides are absent.
      if (friPresent || monPresent) {
        weekendAdded += 1;
        qualifying.add(ymd);
      }
    }
    if (weekendAdded > 0) {
      presentDatesByUser.set(uid, qualifying);
      presentDaysByUser.set(uid, (presentDaysByUser.get(uid) || 0) + weekendAdded);
    }
  }

  return {
    presentDaysByUser,
    paidLeaveDaysByUser,
    unpaidLeaveDaysByUser,
    presentDatesByUser,
    leaveDaysByUser,
    shortHoursUnpaidDaysByUser,
  };
}

/** Match payroll run calendar month to expense claim_date (YYYY-MM-DD), not stored payroll_* columns. */
function claimDateMatchesPayrollMonth(claimDateStr: string | null | undefined, year: number, month: number): boolean {
  const raw = claimDateStr != null ? String(claimDateStr).slice(0, 10) : "";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(raw);
  if (!m) return false;
  return parseInt(m[1], 10) === year && parseInt(m[2], 10) === month;
}

/** After payroll is generated for a period, mark all approved (unpaid) reimbursements for that company whose claim falls in that calendar month. */
async function markReimbursementsPaidForPayrollMonth(
  companyId: string,
  periodId: string,
  year: number,
  month: number
): Promise<void> {
  const { data: pendingReimb, error } = await supabase
    .from("HRMS_reimbursements")
    .select("id, claim_date")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .is("included_in_payroll_period_id", null);
  if (error) throw new Error(error.message);
  const idsToMark = (pendingReimb ?? [])
    .filter((r: any) => claimDateMatchesPayrollMonth(r.claim_date, year, month))
    .map((r: any) => r.id);
  if (!idsToMark.length) return;
  const { error: upErr } = await supabase
    .from("HRMS_reimbursements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      included_in_payroll_period_id: periodId,
    })
    .in("id", idsToMark);
  if (upErr) throw new Error(upErr.message);
}

/** Approved reimbursements for this payroll month, not yet paid out on a payslip. */
async function fetchApprovedReimbursementTotalsByUser(
  companyId: string,
  year: number,
  month: number
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("HRMS_reimbursements")
    .select("employee_user_id, amount, claim_date")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .is("included_in_payroll_period_id", null);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    if (!claimDateMatchesPayrollMonth(r.claim_date as string, year, month)) continue;
    const uid = r.employee_user_id as string | null;
    if (!uid) continue;
    const amt = Number(r.amount) || 0;
    map.set(uid, (map.get(uid) || 0) + amt);
  }
  return map;
}

type PayrollPreviewPeriodCtx = {
  periodName: string;
  periodStart: string;
  periodEnd: string;
  daysInMonth: number;
  workingDaysInFullMonth: number;
  workingDaysThroughRunDay: number;
  effectiveRunDay: number;
};

/** Live preview rows from Payroll Master + attendance/leave (no saved payslips). */
async function computeFreshPayrollPreviewFromMasters(
  companyId: string,
  year: number,
  month: number,
  runDay: number,
  ctx: PayrollPreviewPeriodCtx,
): Promise<{ rows: any[] }> {
  const { periodStart, periodEnd, daysInMonth, effectiveRunDay } = ctx;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const { data: company } = await supabase
    .from("HRMS_companies")
    .select("professional_tax_monthly")
    .eq("id", companyId)
    .single();
  const ptFixed = company?.professional_tax_monthly != null ? Number(company.professional_tax_monthly) : 200;
  const privateCfg = await fetchCompanyPrivatePayrollConfig(companyId);

  // Use month end for applicability (master effective dates are monthly, not "through run day").
  const masters = await fetchApplicablePayrollMasters(companyId, periodStart, monthEnd);
  if (!masters?.length) return { rows: [] };

  const userIds = masters.map((m: any) => m.employee_user_id);
  const { data: users } = await supabase
    .from("HRMS_users")
    .select("id, name, email, date_of_joining, date_of_leaving, role, government_pay_level, pf_eligible, esic_eligible")
    .in("id", userIds);

  const userById = new Map((users ?? []).map((u: any) => [u.id, u]));
  const periodStartDate = new Date(periodStart + "T00:00:00Z");
  const periodEndExclusive = new Date(Date.UTC(year, month - 1, effectiveRunDay + 1, 0, 0, 0, 0));

  const {
    presentDaysByUser,
    paidLeaveDaysByUser,
    unpaidLeaveDaysByUser,
    presentDatesByUser,
    leaveDaysByUser,
    shortHoursUnpaidDaysByUser,
  } =
    await computeAttendanceDrivenPayDays({
      companyId,
      userIds,
      periodStartYmd: periodStart,
      periodEndExclusive,
    });

  const reimbByUser = await fetchApprovedReimbursementTotalsByUser(companyId, year, month);

  const periodEndYmdInclusive = toYmdUtc(new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000));
  const companyHolidayDates = await loadCompanyHolidayDateSet(companyId, periodStart, periodEndYmdInclusive);
  const joinDateByUserId = new Map<string, string | null>(
    (users ?? []).map((u: any) => [u.id as string, u.date_of_joining ? String(u.date_of_joining).slice(0, 10) : null]),
  );
  const plRemainingByUser = await loadPaidLeaveRemainingByUser({
    companyId,
    userIds,
    joinDateByUserId,
    asOfYmd: periodEndYmdInclusive,
  });

  const rows: any[] = [];
  for (const m of masters) {
    const u = userById.get(m.employee_user_id);
    if (!u || u.role === "super_admin") continue;

    const doj = u.date_of_joining ? new Date(String(u.date_of_joining) + "T00:00:00Z") : null;
    const dol = u.date_of_leaving ? new Date(String(u.date_of_leaving) + "T00:00:00Z") : null;

    if (dol && dol < periodStartDate) continue;
    if (doj && doj > periodEndExclusive) continue;

    const employmentStart = doj && doj > periodStartDate ? doj : periodStartDate;
    const employmentEndInclusive =
      dol && dol < new Date(periodEndExclusive.getTime() - 1) ? dol : new Date(periodEndExclusive.getTime() - 1);
    const eligibleStartYmd = toYmdUtc(employmentStart);
    const eligibleEndYmd = toYmdUtc(employmentEndInclusive);
    const eligStartYmd = eligibleStartYmd > periodStart ? eligibleStartYmd : periodStart;
    const eligEndYmd = eligibleEndYmd < periodEndYmdInclusive ? eligibleEndYmd : periodEndYmdInclusive;
    const eligibleCalendarDays = countCalendarDaysInclusive(eligStartYmd, eligEndYmd);

    let unpaidLeaveDays = (unpaidLeaveDaysByUser.get(m.employee_user_id) || 0) + (shortHoursUnpaidDaysByUser.get(m.employee_user_id) || 0);
    let paidLeaveDays = paidLeaveDaysByUser.get(m.employee_user_id) || 0;
    const presentDays = presentDaysByUser.get(m.employee_user_id) || 0;
    const holidayPayDays = countEligibleWeekdayHolidaysNotOverlapping(
      companyHolidayDates,
      eligStartYmd,
      eligEndYmd,
      presentDatesByUser.get(m.employee_user_id),
      leaveDaysByUser.get(m.employee_user_id),
    );

    // Smart PL top-up: convert unpaid days into paid days using remaining Earned Leave (EL) balance.
    // Supports half-day increments.
    const plRemaining = plRemainingByUser.get(m.employee_user_id) || 0;
    const plCover = Math.min(plRemaining, unpaidLeaveDays);
    if (plCover > 0) {
      unpaidLeaveDays -= plCover;
      paidLeaveDays += plCover;
    }

    if (m.payroll_mode === "government") {
      const grossBasic = Number(m.gross_basic) || Number(m.gross_salary) || 0;
      if (grossBasic <= 0) continue;
      if (u.government_pay_level == null) {
        rows.push({
          employeeUserId: m.employee_user_id,
          employeeName: u.name,
          employeeEmail: u.email,
          payrollMode: "government",
          error: "Missing government pay level on employee profile",
        });
        continue;
      }
      const comp = computeGovernmentMonthlyPayroll({
        grossBasic,
        daPercent: Number(m.da_percent) || 53,
        hraPercent: Number(m.hra_percent) || 30,
        medicalFixed: Number(m.medical_fixed) || 3000,
        transportDaPercent: Number(m.transport_da_percent) || 48.06,
        payLevel: u.government_pay_level as number,
        daysInMonth,
        unpaidDays: Math.max(
          0,
          daysInMonth -
            resolvePayDaysFromAttendance({
              presentDays,
              paidLeaveDays,
              unpaidLeaveDays,
              eligibleDays: eligibleCalendarDays,
              holidayPayDays,
            }),
        ),
        deductionDefaults: masterRowToDeductionDefaults(m as Record<string, unknown>),
      });
      const paidDaysGov = Math.max(
        0,
        resolvePayDaysFromAttendance({
          presentDays,
          paidLeaveDays,
          unpaidLeaveDays,
          eligibleDays: eligibleCalendarDays,
          holidayPayDays,
        }),
      );
      const reimbursement = Math.round(reimbByUser.get(m.employee_user_id) || 0);
      const advMonthG = Math.round(Number(m.advance_bonus) || 0);
      const takeHome = comp.netSalary + advMonthG + reimbursement;
      const cpfStatutory = Math.round(
        comp.deductions.cpf + comp.deductions.daCpf + comp.deductions.vpf + comp.deductions.pfLoan,
      );
      rows.push({
        employeeUserId: m.employee_user_id,
        employeeName: u.name,
        employeeEmail: u.email,
        payrollMode: "government",
        payDays: paidDaysGov,
        rawPayDays: paidDaysGov,
        attendanceQualifyingDays: presentDays,
        payDaysSuppressedMinAttendance: false,
        unpaidLeaveDays,
        grossMonthly: Math.round(grossBasic),
        grossPay: comp.totalEarnings,
        deductions: comp.totalDeductions,
        netPay: comp.netSalary,
        takeHome: Math.round(takeHome),
        tds: Math.round(comp.deductions.incomeTax),
        incentive: advMonthG,
        prBonus: 0,
        reimbursement,
        profTax: comp.deductions.pt,
        governmentMonthly: comp,
        govRecalc: {
          grossBasic,
          daPercent: Number(m.da_percent) || 53,
          hraPercent: Number(m.hra_percent) || 30,
          medicalFixed: Number(m.medical_fixed) || 3000,
          transportDaPercent: Number(m.transport_da_percent) || 48.06,
          payLevel: u.government_pay_level as number,
          deductionDefaults: masterRowToDeductionDefaults(m as Record<string, unknown>),
        },
        ctc: Math.round(Number(m.ctc) || grossBasic),
        ctcBase: Math.round(Number(m.ctc) || grossBasic),
        pfEmployee: cpfStatutory,
        pfEmployer: 0,
        esicEmployee: 0,
        esicEmployer: 0,
      });
      continue;
    }

    const rawPayDaysFromAttendance = resolvePayDaysFromAttendance({
      presentDays,
      paidLeaveDays,
      unpaidLeaveDays,
      eligibleDays: eligibleCalendarDays,
      holidayPayDays,
    });
    // Always include employee even when payDays is 0 (admin can edit payDays in UI).
    const payDays = Math.max(0, rawPayDaysFromAttendance);
    const rawPayDays = payDays;

    const grossMonthly = Number(m.gross_salary) || 0;
    if (grossMonthly <= 0) continue;

    const ratio = payDays / Math.max(1, daysInMonth);
    const mb = Number(m.basic) ?? 0;
    const mh = Number(m.hra) ?? 0;
    const mm = Number(m.medical) ?? 0;
    const mt = Number(m.trans) ?? 0;
    const ml = Number(m.lta) ?? 0;
    const mp = Number(m.personal) ?? 0;
    const componentsSum = mb + mh + mm + mt + ml + mp;
    const basicMonthly = componentsSum > 0 ? mb : Math.round(grossMonthly * 0.5);
    const hraMonthly = componentsSum > 0 ? mh : Math.round(grossMonthly * 0.2);
    const medicalMonthly = componentsSum > 0 ? mm : Math.round(grossMonthly * 0.05);
    const transMonthly = componentsSum > 0 ? mt : Math.round(grossMonthly * 0.05);
    const ltaMonthly = componentsSum > 0 ? ml : Math.round(grossMonthly * 0.1);
    const personalMonthly = componentsSum > 0 ? mp : Math.round(grossMonthly * 0.1);

    const grossPay = payDays > 0 ? Math.round((grossMonthly * payDays) / Math.max(1, daysInMonth)) : 0;
    const basicPay = Math.round(basicMonthly * ratio);
    const hraPay = Math.round(hraMonthly * ratio);
    const medicalPay = Math.round(medicalMonthly * ratio);
    const transPay = Math.round(transMonthly * ratio);
    const ltaPay = Math.round(ltaMonthly * ratio);
    const personalPay = Math.round(personalMonthly * ratio);
    const masterPt = m.pt != null ? Number(m.pt) : NaN;
    const profTax = Number.isFinite(masterPt) && masterPt >= 0 ? masterPt : ptFixed;
    const profTaxMonthly = Math.round(profTax);
    const statM = privateStatutoryMonthlyFromMaster(m, profTaxMonthly, privateCfg, u);
    const pfEmp = statM.pfEmp * (payDays / Math.max(1, daysInMonth));
    const pfEmpr = statM.pfEmpr * (payDays / Math.max(1, daysInMonth));
    const esicEmp = statM.esicEmp * (payDays / Math.max(1, daysInMonth));
    const esicEmpr = statM.esicEmpr * (payDays / Math.max(1, daysInMonth));
    const profTaxApplied = payDays > 0 ? profTaxMonthly : 0;
    const deductions = Math.round(pfEmp + esicEmp + profTaxApplied);
    const netPay = grossPay - deductions;
    const tdsMonth = Number(m.tds) || 0;
    const advMonth = Number(m.advance_bonus) || 0;
    const incentive = Math.round(advMonth * ratio);
    const prBonus = 0;
    const reimbursement = Math.round(reimbByUser.get(m.employee_user_id) || 0);
    const tds = Math.round(tdsMonth);
    const takeHome = netPay - tds + incentive + prBonus + reimbursement;

    const ctcBase = Math.round(statM.ctc);
    rows.push({
      employeeUserId: m.employee_user_id,
      employeeName: u.name,
      employeeEmail: u.email,
      payDays,
      rawPayDays,
      attendanceQualifyingDays: presentDays,
      payDaysSuppressedMinAttendance: false,
      unpaidLeaveDays,
      grossMonthly: Math.round(grossMonthly),
      grossPay,
      basicPay,
      hraPay,
      medicalPay,
      transPay,
      ltaPay,
      personalPay,
      pfEmployee: Math.round(pfEmp),
      pfEmployer: Math.round(pfEmpr),
      esicEmployee: Math.round(esicEmp),
      esicEmployer: Math.round(esicEmpr),
      profTax: profTaxApplied,
      profTaxMonthly,
      deductions,
      netPay,
      incentive,
      prBonus,
      reimbursement,
      tds,
      takeHome,
      ctc: ctcBase + incentive + prBonus,
      ctcBase,
      pfEligible: privatePfEligibleMerged(m, u),
      esicEligible: privateEsicEligibleMerged(m, u),
    });
  }

  return { rows };
}

function mapSavedPayslipToPreviewRow(p: any, u: any | undefined, gov: any | undefined) {
  const net = Number(p.net_pay) ?? 0;
  const tds = Number(p.tds) ?? 0;
  const inc = Number(p.incentive) ?? 0;
  const bonus = Number(p.pr_bonus) ?? 0;
  const reimb = Number(p.reimbursement) ?? 0;
  const takeHome = net - tds + inc + bonus + reimb;
  const isGov = p.payroll_mode === "government" || !!gov;
  return {
    employeeUserId: p.employee_user_id,
    employeeName: u?.name ?? null,
    employeeEmail: u?.email ?? "",
    payDays: Number(p.pay_days) ?? 0,
    unpaidLeaveDays: gov ? Number(gov.unpaid_days) || 0 : 0,
    grossPay: Math.round(Number(p.gross_pay) ?? 0),
    pfEmployee: Math.round(Number(p.pf_employee) ?? 0),
    pfEmployer: Math.round(Number(p.pf_employer) ?? 0),
    esicEmployee: Math.round(Number(p.esic_employee) ?? 0),
    esicEmployer: Math.round(Number(p.esic_employer) ?? 0),
    profTax: Math.round(Number(p.professional_tax) ?? 0),
    deductions: Math.round(Number(p.deductions) ?? 0),
    netPay: Math.round(net),
    incentive: inc,
    prBonus: bonus,
    reimbursement: reimb,
    tds,
    takeHome: Math.round(takeHome),
    ctc: Math.round(Number(p.ctc) ?? 0),
    payrollMode: isGov ? "government" : "private",
    governmentMonthly: gov ?? null,
    payslipPending: false,
  };
}

async function computePreview(
  companyId: string,
  year: number,
  month: number,
  runDay: number
): Promise<{
  periodName: string;
  periodStart: string;
  periodEnd: string;
  daysInMonth: number;
  /** Mon–Fri minus company holidays in the full calendar month (salary proration denominator). */
  workingDaysInFullMonth: number;
  /** Mon–Fri minus holidays from month start through the selected run date (typical max pay days for the partial period). */
  workingDaysThroughRunDay: number;
  effectiveRunDay: number;
  alreadyRun: boolean;
  existingPeriodId: string | null;
  /** True when every current master employee who appears in the live preview already has a payslip for this period. */
  payrollComplete?: boolean;
  /** Eligible employees with master but no payslip yet (only when alreadyRun). */
  missingPayslipCount?: number;
  rows: {
    employeeUserId: string;
    employeeName: string | null;
    employeeEmail: string;
    payDays: number;
    unpaidLeaveDays: number;
    grossPay: number;
    pfEmployee: number;
    pfEmployer: number;
    esicEmployee: number;
    esicEmployer: number;
    profTax: number;
    deductions: number;
    netPay: number;
    takeHome: number;
    ctc: number;
  }[];
}> {
  const daysInMonth = getDaysInMonth(year, month);
  const effectiveRunDay = Math.min(Math.max(1, runDay), daysInMonth);
  const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const periodEnd = new Date(Date.UTC(year, month - 1, effectiveRunDay)).toISOString().slice(0, 10);
  const periodName = `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]}-${String(year).slice(-2)}`;

  // For client clarity we treat payroll "days" as calendar days (no separate weekends/working-days concept).
  // Keep field names for backward compatibility with UI.
  const workingDaysInFullMonth = Math.max(1, daysInMonth);
  const workingDaysThroughRunDay = Math.max(1, effectiveRunDay);

  // One payroll run per calendar month (period_start is always YYYY-MM-01); do not allow a second run with a different "through" date.
  const { data: existingPeriod } = await supabase
    .from("HRMS_payroll_periods")
    .select("id")
    .eq("company_id", companyId)
    .eq("period_start", periodStart)
    .maybeSingle();

  const periodCtx: PayrollPreviewPeriodCtx = {
    periodName,
    periodStart,
    periodEnd,
    daysInMonth,
    workingDaysInFullMonth,
    workingDaysThroughRunDay,
    effectiveRunDay,
  };

  if (!existingPeriod?.id) {
    const { rows } = await computeFreshPayrollPreviewFromMasters(companyId, year, month, runDay, periodCtx);
    return {
      ...periodCtx,
      alreadyRun: false,
      existingPeriodId: null,
      payrollComplete: true,
      missingPayslipCount: 0,
      rows,
    };
  }

  const { data: payslips } = await supabase
    .from("HRMS_payslips")
    .select(
      "employee_user_id, pay_days, gross_pay, net_pay, pf_employee, pf_employer, esic_employee, esic_employer, professional_tax, incentive, pr_bonus, reimbursement, tds, deductions, ctc, payroll_mode",
    )
    .eq("payroll_period_id", existingPeriod.id)
    .eq("company_id", companyId);
  const { data: govSaved } = await supabase
    .from("HRMS_government_monthly_payroll")
    .select("*")
    .eq("payroll_period_id", existingPeriod.id)
    .eq("company_id", companyId);
  const govByUser = new Map((govSaved ?? []).map((g: any) => [g.employee_user_id, g]));

  const { rows: freshRows } = await computeFreshPayrollPreviewFromMasters(companyId, year, month, runDay, periodCtx);

  if (!(payslips ?? []).length) {
    const rows = freshRows.map((r) => ({ ...r, payslipPending: true }));
    return {
      ...periodCtx,
      alreadyRun: true,
      existingPeriodId: existingPeriod.id,
      payrollComplete: rows.length === 0,
      missingPayslipCount: rows.length,
      rows,
    };
  }

  const slipIds = new Set((payslips ?? []).map((p: any) => p.employee_user_id as string).filter(Boolean));
  const savedByUser = new Map((payslips ?? []).map((p: any) => [p.employee_user_id as string, p]));
  const freshIds = freshRows.map((r: any) => r.employeeUserId as string).filter(Boolean);
  const nameLookupIds = [...new Set([...slipIds, ...freshIds])];
  const { data: usersForNames } = await supabase.from("HRMS_users").select("id, name, email").in("id", nameLookupIds);
  const nameById = new Map((usersForNames ?? []).map((u: any) => [u.id, u]));

  const merged: any[] = [];
  const freshIdSet = new Set(freshIds);
  for (const fr of freshRows) {
    const uid = fr.employeeUserId as string;
    if (slipIds.has(uid)) {
      const p = savedByUser.get(uid);
      if (p) merged.push(mapSavedPayslipToPreviewRow(p, nameById.get(uid), govByUser.get(uid)));
    } else {
      merged.push({ ...fr, payslipPending: true });
    }
  }
  for (const p of payslips ?? []) {
    const uid = p.employee_user_id as string;
    if (!freshIdSet.has(uid)) {
      merged.push(mapSavedPayslipToPreviewRow(p, nameById.get(uid), govByUser.get(uid)));
    }
  }

  const missingPayslipCount = merged.filter((r) => r.payslipPending).length;
  return {
    ...periodCtx,
    alreadyRun: true,
    existingPeriodId: existingPeriod.id,
    payrollComplete: missingPayslipCount === 0,
    missingPayslipCount,
    rows: merged,
  };
}

/** Build and upload payroll Excel from all payslips stored for the period (after inserts). */
async function persistPayrollExcelWorkbook(
  companyId: string,
  periodId: string,
  year: number,
  month: number,
  periodEndYmd: string,
): Promise<string | null> {
  const { data: allSlips, error: slipErr } = await supabase
    .from("HRMS_payslips")
    .select(
      "employee_user_id, payroll_mode, bank_name, bank_account_number, bank_ifsc, ctc, gross_pay, net_pay, pay_days, basic, hra, medical, trans, lta, personal, deductions, pf_employee, pf_employer, esic_employee, esic_employer, professional_tax, incentive, pr_bonus, reimbursement, tds",
    )
    .eq("payroll_period_id", periodId)
    .eq("company_id", companyId);
  if (slipErr || !(allSlips ?? []).length) return null;

  const uids = [...new Set((allSlips ?? []).map((p: any) => p.employee_user_id as string).filter(Boolean))];
  const { data: allUsers } = await supabase
    .from("HRMS_users")
    .select("id, name, bank_name, bank_account_number, bank_ifsc")
    .in("id", uids);
  const nameById = new Map((allUsers ?? []).map((u: any) => [u.id, u]));

  const { data: allGov } = await supabase
    .from("HRMS_government_monthly_payroll")
    .select("*")
    .eq("payroll_period_id", periodId)
    .eq("company_id", companyId);
  const govByUser = new Map((allGov ?? []).map((g: any) => [g.employee_user_id, g]));

  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fileName = `${monthNames[month]} ${year} Payroll`;

  const rows = (allSlips ?? []).map((p: any) => {
    const u = nameById.get(p.employee_user_id);
    const mergedSlip = {
      ...p,
      bank_name: p.bank_name ?? u?.bank_name ?? null,
      bank_account_number: p.bank_account_number ?? u?.bank_account_number ?? null,
      bank_ifsc: p.bank_ifsc ?? u?.bank_ifsc ?? null,
    };
    return buildPayrollExcelRow(mergedSlip, u?.name ?? "");
  });

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [...PAYROLL_EXCEL_HEADER],
  });
  ws["!cols"] = PAYROLL_EXCEL_HEADER.map((_, i) => ({ wch: i < 4 ? 22 : 14 }));
  const amountCols = payrollExcelAmountColumnIndices();
  const rowCount = rows.length + 1;
  for (let r = 1; r <= rowCount; r++) {
    for (const c of amountCols) {
      const ref = XLSX.utils.encode_cell({ r: r - 1, c });
      if (ws[ref]) ws[ref].s = { alignment: { horizontal: "center", vertical: "center" } };
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
  const excelPath = `HRMS/${companyId}/monthly payroll/${fileName}.xlsx`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(excelPath, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
  if (!uploadErr) {
    await supabase.from("HRMS_payroll_periods").update({ excel_file_path: excelPath }).eq("id", periodId);
  }
  return uploadErr ? null : excelPath;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
  const runDay = parseInt(searchParams.get("runDay") || String(new Date().getDate()), 10);

  if (year < 2000 || year > 2100) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  if (month < 1 || month > 12) return NextResponse.json({ error: "Invalid month" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id)
    return NextResponse.json({
      preview: {
        periodName: "",
        periodStart: "",
        periodEnd: "",
        daysInMonth: 0,
        workingDaysInFullMonth: 0,
        workingDaysThroughRunDay: 0,
        effectiveRunDay: 0,
        alreadyRun: false,
        existingPeriodId: null,
        rows: [],
      },
    });

  const preview = await computePreview(me.company_id, year, month, runDay);
  return NextResponse.json({ preview });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const year = typeof body?.year === "number" ? body.year : parseInt(String(body?.year || new Date().getFullYear()), 10);
  const month = typeof body?.month === "number" ? body.month : parseInt(String(body?.month || (new Date().getMonth() + 1)), 10);
  const runDay = typeof body?.runDay === "number" ? body.runDay : parseInt(String(body?.runDay || new Date().getDate()), 10);

  if (year < 2000 || year > 2100) return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  if (month < 1 || month > 12) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const daysInMonth = getDaysInMonth(year, month);
  const effectiveRunDay = Math.min(Math.max(1, runDay), daysInMonth);

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const periodEnd = new Date(Date.UTC(year, month - 1, effectiveRunDay)).toISOString().slice(0, 10);
  const periodName = `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]}-${String(year).slice(-2)}`;

  const { data: existingPeriod } = await supabase
    .from("HRMS_payroll_periods")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("period_start", periodStart)
    .maybeSingle();

  const completeMissingPayslips = body?.completeMissingPayslips === true;
  const overrideRowsEarly = Array.isArray(body?.rows) ? body.rows : null;

  if (completeMissingPayslips) {
    if (!existingPeriod?.id) {
      return NextResponse.json(
        { error: "No payroll period found for this month. Run payroll for the month first, then use this to add missing employees." },
        { status: 400 },
      );
    }
    if (overrideRowsEarly?.length) {
      return NextResponse.json(
        { error: "completeMissingPayslips cannot be combined with a rows payload. Use Generate without overrides to add missing payslips." },
        { status: 400 },
      );
    }

    const { data: existingSlips } = await supabase
      .from("HRMS_payslips")
      .select("employee_user_id")
      .eq("payroll_period_id", existingPeriod.id)
      .eq("company_id", me.company_id);
    const slipUids = new Set((existingSlips ?? []).map((s: any) => s.employee_user_id as string).filter(Boolean));

    const { data: companyCm } = await supabase
      .from("HRMS_companies")
      .select("professional_tax_monthly")
      .eq("id", me.company_id)
      .single();
    const ptFixedCm = companyCm?.professional_tax_monthly != null ? Number(companyCm.professional_tax_monthly) : 200;
    const privateCfgCm = await fetchCompanyPrivatePayrollConfig(me.company_id);

    const monthEndCm = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const mastersCm = await fetchApplicablePayrollMasters(me.company_id, periodStart, monthEndCm);
    if (!mastersCm?.length) {
      return NextResponse.json({ error: "No active payroll master records." }, { status: 400 });
    }

    const userIdsCm = mastersCm.map((m: any) => m.employee_user_id);
    const { data: usersCm, error: usersCmErr } = await supabase
      .from("HRMS_users")
      .select(
        "id, name, email, date_of_joining, date_of_leaving, role, bank_name, bank_account_number, bank_ifsc, government_pay_level, pf_eligible, esic_eligible",
      )
      .in("id", userIdsCm);
    if (usersCmErr) return NextResponse.json({ error: usersCmErr.message }, { status: 400 });
    const userByIdCm = new Map((usersCm ?? []).map((u: any) => [u.id, u]));

    let payslipsCm: any[] = [];
    const govLinesCm: {
      employeeUserId: string;
      masterId: string;
      unpaidDays: number;
      payLevel: number;
      transportDaPercent: number;
      comp: ReturnType<typeof computeGovernmentMonthlyPayroll>;
    }[] = [];

    const periodStartDateCm = new Date(periodStart + "T00:00:00Z");
    const periodEndExclusiveCm = new Date(Date.UTC(year, month - 1, effectiveRunDay + 1, 0, 0, 0, 0));
    const periodEndYmdInclusivePostCm = toYmdUtc(new Date(periodEndExclusiveCm.getTime() - 24 * 60 * 60 * 1000));

    const {
      presentDaysByUser: presCm,
      paidLeaveDaysByUser: paidCm,
      unpaidLeaveDaysByUser: unpaidCm,
      presentDatesByUser: presDatesCm,
      leaveDaysByUser: leaveDaysCm,
      shortHoursUnpaidDaysByUser: shortHoursUnpaidCm,
    } = await computeAttendanceDrivenPayDays({
      companyId: me.company_id,
      userIds: userIdsCm,
      periodStartYmd: periodStart,
      periodEndExclusive: periodEndExclusiveCm,
    });

    const reimbByUserCm = await fetchApprovedReimbursementTotalsByUser(me.company_id, year, month);
    const companyHolidayDatesCm = await loadCompanyHolidayDateSet(me.company_id, periodStart, periodEndYmdInclusivePostCm);
    const joinDateByUserIdCm = new Map<string, string | null>(
      (usersCm ?? []).map((u: any) => [u.id as string, u.date_of_joining ? String(u.date_of_joining).slice(0, 10) : null]),
    );
    const plRemainingByUserCm = await loadPaidLeaveRemainingByUser({
      companyId: me.company_id,
      userIds: userIdsCm,
      joinDateByUserId: joinDateByUserIdCm,
      asOfYmd: periodEndYmdInclusivePostCm,
    });

    for (const m of mastersCm ?? []) {
      if (slipUids.has(m.employee_user_id)) continue;
      const u = userByIdCm.get(m.employee_user_id);
      if (!u || u.role === "super_admin") continue;

      const doj = u.date_of_joining ? new Date(String(u.date_of_joining) + "T00:00:00Z") : null;
      const dol = u.date_of_leaving ? new Date(String(u.date_of_leaving) + "T00:00:00Z") : null;

      if (dol && dol < periodStartDateCm) continue;
      if (doj && doj > periodEndExclusiveCm) continue;

      const employmentStart = doj && doj > periodStartDateCm ? doj : periodStartDateCm;
      const employmentEndInclusive =
        dol && dol < new Date(periodEndExclusiveCm.getTime() - 1) ? dol : new Date(periodEndExclusiveCm.getTime() - 1);
      const eligibleStartYmd = toYmdUtc(employmentStart);
      const eligibleEndYmd = toYmdUtc(employmentEndInclusive);
      const eligStartYmd = eligibleStartYmd > periodStart ? eligibleStartYmd : periodStart;
      const eligEndYmd = eligibleEndYmd < periodEndYmdInclusivePostCm ? eligibleEndYmd : periodEndYmdInclusivePostCm;
      const eligibleCalendarDays = countCalendarDaysInclusive(eligStartYmd, eligEndYmd);

      let unpaidLeaveDays = (unpaidCm.get(m.employee_user_id) || 0) + (shortHoursUnpaidCm.get(m.employee_user_id) || 0);
      let paidLeaveDays = paidCm.get(m.employee_user_id) || 0;
      const presentDays = presCm.get(m.employee_user_id) || 0;
      const holidayPayDays = countEligibleWeekdayHolidaysNotOverlapping(
        companyHolidayDatesCm,
        eligStartYmd,
        eligEndYmd,
        presDatesCm.get(m.employee_user_id),
        leaveDaysCm.get(m.employee_user_id),
      );

      const plRemaining = plRemainingByUserCm.get(m.employee_user_id) || 0;
      const plCover = Math.min(plRemaining, unpaidLeaveDays);
      if (plCover > 0) {
        unpaidLeaveDays -= plCover;
        paidLeaveDays += plCover;
      }

      if (m.payroll_mode === "government") {
        const grossBasic = Number(m.gross_basic) || Number(m.gross_salary) || 0;
        if (grossBasic <= 0) continue;
        if (u.government_pay_level == null) {
          return NextResponse.json(
            { error: `Government payroll: set Government pay level on the employee (${u.email}) before generating a payslip.` },
            { status: 400 },
          );
        }
        const comp = computeGovernmentMonthlyPayroll({
          grossBasic,
          daPercent: Number(m.da_percent) || 53,
          hraPercent: Number(m.hra_percent) || 30,
          medicalFixed: Number(m.medical_fixed) || 3000,
          transportDaPercent: Number(m.transport_da_percent) || 48.06,
          payLevel: u.government_pay_level as number,
          daysInMonth,
          unpaidDays: Math.max(
            0,
            daysInMonth -
              resolvePayDaysFromAttendance({
                presentDays,
                paidLeaveDays,
                unpaidLeaveDays,
                eligibleDays: eligibleCalendarDays,
                holidayPayDays,
              }),
          ),
          deductionDefaults: masterRowToDeductionDefaults(m as Record<string, unknown>),
        });
        const paidDaysGov = Math.max(
          0,
          resolvePayDaysFromAttendance({
            presentDays,
            paidLeaveDays,
            unpaidLeaveDays,
            eligibleDays: eligibleCalendarDays,
            holidayPayDays,
          }),
        );
        const reimbursement = Math.round(reimbByUserCm.get(m.employee_user_id) || 0);
        const advMonthG = Math.round(Number(m.advance_bonus) || 0);
        const takeHomeIns = comp.netSalary + advMonthG + reimbursement;
        const pfEmpGov = Math.round(
          comp.deductions.cpf + comp.deductions.daCpf + comp.deductions.vpf + comp.deductions.pfLoan,
        );
        payslipsCm.push({
          payroll_mode: "government",
          company_id: me.company_id,
          employee_id: null,
          employee_user_id: m.employee_user_id,
          payroll_period_id: existingPeriod.id,
          basic: comp.basicPaid,
          hra: comp.hraPaid,
          medical: comp.medicalPaid,
          trans: comp.transportPaid,
          lta: 0,
          personal: 0,
          allowances: 0,
          deductions: comp.totalDeductions,
          gross_pay: comp.totalEarnings,
          net_pay: takeHomeIns,
          pay_days: paidDaysGov,
          ctc: Math.round(Number(m.ctc) || grossBasic),
          pf_employee: pfEmpGov,
          pf_employer: 0,
          esic_employee: 0,
          esic_employer: 0,
          professional_tax: comp.deductions.pt,
          incentive: advMonthG,
          pr_bonus: 0,
          reimbursement,
          tds: comp.deductions.incomeTax,
          bank_name: u?.bank_name ?? null,
          bank_account_number: u?.bank_account_number ?? null,
          bank_ifsc: u?.bank_ifsc ?? null,
        });
        govLinesCm.push({
          employeeUserId: m.employee_user_id,
          masterId: m.id as string,
          unpaidDays: unpaidLeaveDays,
          payLevel: u.government_pay_level as number,
          transportDaPercent: Number(m.transport_da_percent) || 48.06,
          comp,
        });
        continue;
      }

      const rawPayDaysFromAttendance = resolvePayDaysFromAttendance({
        presentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        eligibleDays: eligibleCalendarDays,
        holidayPayDays,
      });
      const payDays = Math.max(0, rawPayDaysFromAttendance);
      const rawPayDays = payDays;

      const grossMonthly = Number(m.gross_salary) || 0;
      if (grossMonthly <= 0) continue;

      const ratio = payDays / Math.max(1, daysInMonth);
      const grossPay = payDays > 0 ? Math.round((grossMonthly * payDays) / Math.max(1, daysInMonth)) : 0;
      const mb = Number(m.basic) ?? 0;
      const mh = Number(m.hra) ?? 0;
      const mm = Number(m.medical) ?? 0;
      const mt = Number(m.trans) ?? 0;
      const ml = Number(m.lta) ?? 0;
      const mp = Number(m.personal) ?? 0;
      const componentsSum = mb + mh + mm + mt + ml + mp;
      const basicPay = componentsSum > 0 ? Math.round(mb * ratio) : Math.round(grossPay * 0.5);
      const hraPay = componentsSum > 0 ? Math.round(mh * ratio) : Math.round(grossPay * 0.2);
      const medicalPay = componentsSum > 0 ? Math.round(mm * ratio) : Math.round(grossPay * 0.05);
      const transPay = componentsSum > 0 ? Math.round(mt * ratio) : Math.round(grossPay * 0.05);
      const ltaPay = componentsSum > 0 ? Math.round(ml * ratio) : Math.round(grossPay * 0.1);
      const personalPay = componentsSum > 0 ? Math.round(mp * ratio) : Math.round(grossPay * 0.1);
      const masterPtIns = m.pt != null ? Number(m.pt) : NaN;
      const profTaxIns = Number.isFinite(masterPtIns) && masterPtIns >= 0 ? masterPtIns : ptFixedCm;
      const profTaxMonthlyRoundedCm = Math.round(profTaxIns);
      const statCm = privateStatutoryMonthlyFromMaster(m, profTaxMonthlyRoundedCm, privateCfgCm, u);
      const pfEmp = Math.round(statCm.pfEmp * (payDays / Math.max(1, daysInMonth)));
      const pfEmpr = Math.round(statCm.pfEmpr * (payDays / Math.max(1, daysInMonth)));
      const esicEmp = Math.round(statCm.esicEmp * (payDays / Math.max(1, daysInMonth)));
      const esicEmpr = Math.round(statCm.esicEmpr * (payDays / Math.max(1, daysInMonth)));
      const deductions = pfEmp + esicEmp + profTaxIns;
      const netPay = grossPay - deductions;
      const tdsMonthIns = Number(m.tds) || 0;
      const advMonthIns = Number(m.advance_bonus) || 0;
      const incentiveIns = Math.round(advMonthIns * ratio);
      const tdsIns = Math.round(tdsMonthIns);
      const prBonusIns = 0;
      const reimbursement = Math.round(reimbByUserCm.get(m.employee_user_id) || 0);
      const takeHomeIns = netPay - tdsIns + incentiveIns + prBonusIns + reimbursement;

      payslipsCm.push({
        payroll_mode: "private",
        company_id: me.company_id,
        employee_id: null,
        employee_user_id: m.employee_user_id,
        payroll_period_id: existingPeriod.id,
        basic: basicPay,
        hra: hraPay,
        medical: medicalPay,
        trans: transPay,
        lta: ltaPay,
        personal: personalPay,
        allowances: 0,
        deductions,
        gross_pay: grossPay,
        net_pay: takeHomeIns,
        pay_days: payDays,
        ctc: Math.round(statCm.ctc),
        pf_employee: pfEmp,
        pf_employer: pfEmpr,
        esic_employee: esicEmp,
        esic_employer: esicEmpr,
        professional_tax: profTaxIns,
        incentive: incentiveIns,
        pr_bonus: prBonusIns,
        reimbursement,
        tds: tdsIns,
        bank_name: u?.bank_name ?? null,
        bank_account_number: u?.bank_account_number ?? null,
        bank_ifsc: u?.bank_ifsc ?? null,
      });
    }

    if (!payslipsCm.length) {
      return NextResponse.json(
        {
          error:
            "No additional payslips to create. Either every current employee already has a payslip, or remaining employees have no payable days / no gross / missing government pay level.",
        },
        { status: 400 },
      );
    }

    const { data: insertedCm, error: slipCmErr } = await supabase
      .from("HRMS_payslips")
      .insert(payslipsCm)
      .select("id, employee_user_id");
    if (slipCmErr) return NextResponse.json({ error: slipCmErr.message }, { status: 400 });

    if (govLinesCm.length && insertedCm?.length) {
      const slipByUserCm = new Map((insertedCm as { id: string; employee_user_id: string }[]).map((s) => [s.employee_user_id, s.id]));
      const monthYmdCm = `${year}-${String(month).padStart(2, "0")}-01`;
      const govInsertsCm = govLinesCm
        .map((g) => {
          const slipId = slipByUserCm.get(g.employeeUserId);
          if (!slipId) return null;
          const c = g.comp;
          const slab = c.transportSlab;
          return {
            company_id: me.company_id,
            payroll_period_id: existingPeriod.id,
            payroll_master_id: g.masterId,
            employee_user_id: g.employeeUserId,
            payslip_id: slipId,
            month_year: monthYmdCm,
            salary_date: periodEnd,
            days_in_month: daysInMonth,
            paid_days: Math.max(0, daysInMonth - g.unpaidDays),
            unpaid_days: g.unpaidDays,
            pay_level: g.payLevel,
            transport_slab_group: slab.transportSlabGroup,
            transport_base: slab.transportBase,
            transport_da_percent: g.transportDaPercent,
            basic_actual: c.basicActual,
            basic_paid: c.basicPaid,
            sp_pay_actual: c.spPayActual,
            sp_pay_paid: c.spPayPaid,
            da_actual: c.daActual,
            da_paid: c.daPaid,
            transport_actual: c.transportActual,
            transport_paid: c.transportPaid,
            hra_actual: c.hraActual,
            hra_paid: c.hraPaid,
            medical_actual: c.medicalActual,
            medical_paid: c.medicalPaid,
            extra_work_allowance_actual: c.extraWorkAllowanceActual,
            extra_work_allowance_paid: c.extraWorkAllowancePaid,
            night_allowance_actual: c.nightAllowanceActual,
            night_allowance_paid: c.nightAllowancePaid,
            uniform_allowance_actual: c.uniformAllowanceActual,
            uniform_allowance_paid: c.uniformAllowancePaid,
            education_allowance_actual: c.educationAllowanceActual,
            education_allowance_paid: c.educationAllowancePaid,
            da_arrears_actual: c.daArrearsActual,
            da_arrears_paid: c.daArrearsPaid,
            transport_arrears_actual: c.transportArrearsActual,
            transport_arrears_paid: c.transportArrearsPaid,
            encashment_actual: c.encashmentActual,
            encashment_paid: c.encashmentPaid,
            encashment_da_actual: c.encashmentDaActual,
            encashment_da_paid: c.encashmentDaPaid,
            income_tax_amount: c.deductions.incomeTax,
            pt_amount: c.deductions.pt,
            lic_amount: c.deductions.lic,
            cpf_amount: c.deductions.cpf,
            da_cpf_amount: c.deductions.daCpf,
            vpf_amount: c.deductions.vpf,
            pf_loan_amount: c.deductions.pfLoan,
            post_office_amount: c.deductions.postOffice,
            credit_society_amount: c.deductions.creditSociety,
            std_licence_fee_amount: c.deductions.stdLicenceFee,
            electricity_amount: c.deductions.electricity,
            water_amount: c.deductions.water,
            mess_amount: c.deductions.mess,
            horticulture_amount: c.deductions.horticulture,
            welfare_amount: c.deductions.welfare,
            veh_charge_amount: c.deductions.vehCharge,
            other_deduction_amount: c.deductions.other,
            total_earnings: c.totalEarnings,
            total_deductions: c.totalDeductions,
            net_salary: c.netSalary,
          };
        })
        .filter(Boolean);
      const mErrCm = govInsertsCm.length
        ? (await supabase.from("HRMS_government_monthly_payroll").insert(govInsertsCm as any[])).error
        : null;
      if (mErrCm) return NextResponse.json({ error: mErrCm.message }, { status: 400 });
    }

    try {
      await markReimbursementsPaidForPayrollMonth(me.company_id, existingPeriod.id, year, month);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to update reimbursement status" }, { status: 400 });
    }

    const excelPathCm = await persistPayrollExcelWorkbook(me.company_id, existingPeriod.id, year, month, periodEnd);

    return NextResponse.json({
      ok: true,
      periodId: existingPeriod.id,
      periodName,
      periodStart,
      periodEnd,
      payslipsGenerated: payslipsCm.length,
      excelPath: excelPathCm ?? undefined,
    });
  }

  if (existingPeriod) {
    return NextResponse.json(
      { error: "Payroll has already been run for this calendar month. You cannot run it again with a different date in the same month." },
      { status: 400 },
    );
  }

  const { data: period, error: periodErr } = await supabase
    .from("HRMS_payroll_periods")
    .insert([{ company_id: me.company_id, period_name: periodName, period_start: periodStart, period_end: periodEnd }])
    .select("id")
    .single();
  if (periodErr) return NextResponse.json({ error: periodErr.message }, { status: 400 });

  const { data: company } = await supabase
    .from("HRMS_companies")
    .select("professional_tax_monthly")
    .eq("id", me.company_id)
    .single();
  const ptFixed = company?.professional_tax_monthly != null ? Number(company.professional_tax_monthly) : 200;
  const privateCfgRun = await fetchCompanyPrivatePayrollConfig(me.company_id);

  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const masters = await fetchApplicablePayrollMasters(me.company_id, periodStart, monthEnd);
  if (!masters?.length) {
    try {
      await markReimbursementsPaidForPayrollMonth(me.company_id, period.id, year, month);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to update reimbursement status" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, periodId: period.id, periodName, periodStart, periodEnd, payslipsGenerated: 0 });
  }

  const userIds = masters.map((m: any) => m.employee_user_id);
  const { data: users, error: usersErr } = await supabase
    .from("HRMS_users")
    .select(
      "id, name, email, date_of_joining, date_of_leaving, role, bank_name, bank_account_number, bank_ifsc, government_pay_level, pf_eligible, esic_eligible",
    )
    .in("id", userIds);
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 400 });

  const userById = new Map((users ?? []).map((u: any) => [u.id, u]));

  const overrideRows = overrideRowsEarly;

  let payslips: any[] = [];
  const govLines: {
    employeeUserId: string;
    masterId: string;
    unpaidDays: number;
    payLevel: number;
    transportDaPercent: number;
    comp: ReturnType<typeof computeGovernmentMonthlyPayroll>;
  }[] = [];

  if (overrideRows?.length) {
    const reimbByUserOverride = await fetchApprovedReimbursementTotalsByUser(me.company_id, year, month);
    for (const row of overrideRows) {
      const employeeUserId = typeof row?.employeeUserId === "string" ? row.employeeUserId : null;
      if (!employeeUserId) continue;
      const u = userById.get(employeeUserId);
      if (!u || u.role === "super_admin") continue;
      const master = (masters ?? []).find((m: any) => m.employee_user_id === employeeUserId);
      if (master?.payroll_mode === "government") {
        const grossBasic = Number(master.gross_basic) || Number(master.gross_salary) || 0;
        if (!(grossBasic > 0)) continue;
        if (u.government_pay_level == null) {
          return NextResponse.json(
            { error: `Government payroll: set Government pay level on the employee (${u.email}) before running payroll.` },
            { status: 400 },
          );
        }
        const payDays = Math.max(0, Math.min(daysInMonth, Math.round(Number(row.payDays) || 0)));
        const unpaidDays = Math.max(0, daysInMonth - payDays);
        const optionalEarnings = optionalEarningsFromClientGovernmentMonthly(row.governmentMonthly);
        const deductionDefaults = deductionDefaultsForGovernmentRun(
          master as Record<string, unknown>,
          row.governmentDeductionDefaults,
        );
        const earningPaidOverrides = governmentEarningPaidOverridesFromBody(row.governmentEarningPaidOverrides);
        const comp = computeGovernmentMonthlyPayroll({
          grossBasic,
          daPercent: Number(master.da_percent) || 53,
          hraPercent: Number(master.hra_percent) || 30,
          medicalFixed: Number(master.medical_fixed) || 3000,
          transportDaPercent: Number(master.transport_da_percent) || 48.06,
          payLevel: u.government_pay_level as number,
          daysInMonth,
          unpaidDays,
          deductionDefaults,
          optionalEarnings,
          earningPaidOverrides,
        });
        const reimbursement = Math.round(Number(row.reimbursement) || reimbByUserOverride.get(employeeUserId) || 0);
        const incentive = Math.round(Number(row.incentive ?? master.advance_bonus) || 0);
        const takeHomeIns = comp.netSalary + incentive + reimbursement;
        const pfEmpGov = Math.round(
          comp.deductions.cpf + comp.deductions.daCpf + comp.deductions.vpf + comp.deductions.pfLoan,
        );
        payslips.push({
          payroll_mode: "government",
          company_id: me.company_id,
          employee_id: null,
          employee_user_id: employeeUserId,
          payroll_period_id: period.id,
          basic: comp.basicPaid,
          hra: comp.hraPaid,
          medical: comp.medicalPaid,
          trans: comp.transportPaid,
          lta: 0,
          personal: 0,
          allowances: 0,
          deductions: comp.totalDeductions,
          gross_pay: comp.totalEarnings,
          net_pay: takeHomeIns,
          pay_days: payDays,
          ctc: Math.round(Number(master.ctc) || grossBasic),
          pf_employee: pfEmpGov,
          pf_employer: 0,
          esic_employee: 0,
          esic_employer: 0,
          professional_tax: comp.deductions.pt,
          incentive,
          pr_bonus: 0,
          reimbursement,
          tds: comp.deductions.incomeTax,
          bank_name: u?.bank_name ?? null,
          bank_account_number: u?.bank_account_number ?? null,
          bank_ifsc: u?.bank_ifsc ?? null,
        });
        govLines.push({
          employeeUserId,
          masterId: master.id as string,
          unpaidDays,
          payLevel: u.government_pay_level as number,
          transportDaPercent: Number(master.transport_da_percent) || 48.06,
          comp,
        });
        continue;
      }
      const payDays = Math.max(0, Math.round(Number(row.payDays) || 0));
      const grossPay = Math.max(0, Math.round(Number(row.grossPay) || 0));
      const deductions = Math.max(0, Math.round(Number(row.deductions) || 0));
      const baseNet = grossPay - deductions;
      const incentive = Math.round(Number(row.incentive) || 0);
      const prBonus = Math.round(Number(row.prBonus) || 0);
      const reimbursement = Math.round(Number(row.reimbursement) || 0);
      const tds = Math.round(Number(row.tds) || 0);
      const takeHome = Math.round(Number(row.takeHome) ?? baseNet - tds + incentive + prBonus + reimbursement);
      const ctc = Math.max(0, Math.round(Number(row.ctc) || 0));
      const pfEmp = Math.round(Number(row.pfEmployee) || 0);
      const pfEmpr = Math.round(Number(row.pfEmployer) || 0);
      const esicEmp = Math.round(Number(row.esicEmployee) || 0);
      const esicEmpr = Math.round(Number(row.esicEmployer) || 0);
      const profTax = Math.round(Number(row.profTax) || 0);
      const basic = Math.round(Number(row.basicPay) || grossPay * 0.5);
      const hra = Math.round(Number(row.hraPay) || grossPay * 0.2);
      const medical = Math.round(Number(row.medicalPay) || grossPay * 0.05);
      const trans = Math.round(Number(row.transPay) || grossPay * 0.05);
      const lta = Math.round(Number(row.ltaPay) || grossPay * 0.1);
      const personal = Math.round(Number(row.personalPay) || grossPay * 0.1);
      const allowances = 0;
      payslips.push({
        company_id: me.company_id,
        employee_id: null,
        employee_user_id: employeeUserId,
        payroll_period_id: period.id,
        basic,
        hra,
        medical,
        trans,
        lta,
        personal,
        allowances,
        deductions,
        gross_pay: grossPay,
        net_pay: takeHome,
        pay_days: payDays,
        ctc,
        pf_employee: pfEmp,
        pf_employer: pfEmpr,
        esic_employee: esicEmp,
        esic_employer: esicEmpr,
        professional_tax: profTax,
        incentive,
        pr_bonus: prBonus,
        reimbursement,
        tds,
        bank_name: u?.bank_name ?? null,
        bank_account_number: u?.bank_account_number ?? null,
        bank_ifsc: u?.bank_ifsc ?? null,
      });
    }
  } else {
    const periodStartDate = new Date(periodStart + "T00:00:00Z");
    const periodEndExclusive = new Date(Date.UTC(year, month - 1, effectiveRunDay + 1, 0, 0, 0, 0));
    const periodEndYmdInclusivePost = toYmdUtc(new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000));

    const {
      presentDaysByUser,
      paidLeaveDaysByUser,
      unpaidLeaveDaysByUser,
      presentDatesByUser,
      leaveDaysByUser,
      shortHoursUnpaidDaysByUser,
    } =
      await computeAttendanceDrivenPayDays({
        companyId: me.company_id,
        userIds,
        periodStartYmd: periodStart,
        periodEndExclusive,
      });

    const reimbByUser = await fetchApprovedReimbursementTotalsByUser(me.company_id, year, month);
    const companyHolidayDatesPost = await loadCompanyHolidayDateSet(me.company_id, periodStart, periodEndYmdInclusivePost);
    const joinDateByUserId = new Map<string, string | null>(
      (users ?? []).map((u: any) => [u.id as string, u.date_of_joining ? String(u.date_of_joining).slice(0, 10) : null]),
    );
    const plRemainingByUser = await loadPaidLeaveRemainingByUser({
      companyId: me.company_id,
      userIds,
      joinDateByUserId,
      asOfYmd: periodEndYmdInclusivePost,
    });

    for (const m of masters ?? []) {
      const u = userById.get(m.employee_user_id);
      if (!u || u.role === "super_admin") continue;

      const doj = u.date_of_joining ? new Date(String(u.date_of_joining) + "T00:00:00Z") : null;
      const dol = u.date_of_leaving ? new Date(String(u.date_of_leaving) + "T00:00:00Z") : null;

      if (dol && dol < periodStartDate) continue;
      if (doj && doj > periodEndExclusive) continue;

      const employmentStart = doj && doj > periodStartDate ? doj : periodStartDate;
      const employmentEndInclusive =
        dol && dol < new Date(periodEndExclusive.getTime() - 1) ? dol : new Date(periodEndExclusive.getTime() - 1);
      const eligibleStartYmd = toYmdUtc(employmentStart);
      const eligibleEndYmd = toYmdUtc(employmentEndInclusive);
      const eligStartYmd = eligibleStartYmd > periodStart ? eligibleStartYmd : periodStart;
      const eligEndYmd = eligibleEndYmd < periodEndYmdInclusivePost ? eligibleEndYmd : periodEndYmdInclusivePost;
      const eligibleCalendarDays = countCalendarDaysInclusive(eligStartYmd, eligEndYmd);

      let unpaidLeaveDays = (unpaidLeaveDaysByUser.get(m.employee_user_id) || 0) + (shortHoursUnpaidDaysByUser.get(m.employee_user_id) || 0);
      let paidLeaveDays = paidLeaveDaysByUser.get(m.employee_user_id) || 0;
      const presentDays = presentDaysByUser.get(m.employee_user_id) || 0;
      const holidayPayDays = countEligibleWeekdayHolidaysNotOverlapping(
        companyHolidayDatesPost,
        eligStartYmd,
        eligEndYmd,
        presentDatesByUser.get(m.employee_user_id),
        leaveDaysByUser.get(m.employee_user_id),
      );

      const plRemaining = plRemainingByUser.get(m.employee_user_id) || 0;
      const plCover = Math.min(plRemaining, unpaidLeaveDays);
      if (plCover > 0) {
        unpaidLeaveDays -= plCover;
        paidLeaveDays += plCover;
      }

      if (m.payroll_mode === "government") {
        const grossBasic = Number(m.gross_basic) || Number(m.gross_salary) || 0;
        if (grossBasic <= 0) continue;
        if (u.government_pay_level == null) {
          return NextResponse.json(
            { error: `Government payroll: set Government pay level on the employee (${u.email}) before running payroll.` },
            { status: 400 },
          );
        }
        const comp = computeGovernmentMonthlyPayroll({
          grossBasic,
          daPercent: Number(m.da_percent) || 53,
          hraPercent: Number(m.hra_percent) || 30,
          medicalFixed: Number(m.medical_fixed) || 3000,
          transportDaPercent: Number(m.transport_da_percent) || 48.06,
          payLevel: u.government_pay_level as number,
          daysInMonth,
          unpaidDays: Math.max(
            0,
            daysInMonth -
              resolvePayDaysFromAttendance({
                presentDays,
                paidLeaveDays,
                unpaidLeaveDays,
                eligibleDays: eligibleCalendarDays,
                holidayPayDays,
              }),
          ),
          deductionDefaults: masterRowToDeductionDefaults(m as Record<string, unknown>),
        });
        const paidDaysGov = Math.max(
          0,
          resolvePayDaysFromAttendance({
            presentDays,
            paidLeaveDays,
            unpaidLeaveDays,
            eligibleDays: eligibleCalendarDays,
            holidayPayDays,
          }),
        );
        const reimbursement = Math.round(reimbByUser.get(m.employee_user_id) || 0);
        const advMonthG = Math.round(Number(m.advance_bonus) || 0);
        const takeHomeIns = comp.netSalary + advMonthG + reimbursement;
        const pfEmpGov = Math.round(
          comp.deductions.cpf + comp.deductions.daCpf + comp.deductions.vpf + comp.deductions.pfLoan,
        );
        payslips.push({
          payroll_mode: "government",
          company_id: me.company_id,
          employee_id: null,
          employee_user_id: m.employee_user_id,
          payroll_period_id: period.id,
          basic: comp.basicPaid,
          hra: comp.hraPaid,
          medical: comp.medicalPaid,
          trans: comp.transportPaid,
          lta: 0,
          personal: 0,
          allowances: 0,
          deductions: comp.totalDeductions,
          gross_pay: comp.totalEarnings,
          net_pay: takeHomeIns,
          pay_days: paidDaysGov,
          ctc: Math.round(Number(m.ctc) || grossBasic),
          pf_employee: pfEmpGov,
          pf_employer: 0,
          esic_employee: 0,
          esic_employer: 0,
          professional_tax: comp.deductions.pt,
          incentive: advMonthG,
          pr_bonus: 0,
          reimbursement,
          tds: comp.deductions.incomeTax,
          bank_name: u?.bank_name ?? null,
          bank_account_number: u?.bank_account_number ?? null,
          bank_ifsc: u?.bank_ifsc ?? null,
        });
        govLines.push({
          employeeUserId: m.employee_user_id,
          masterId: m.id as string,
          unpaidDays: unpaidLeaveDays,
          payLevel: u.government_pay_level as number,
          transportDaPercent: Number(m.transport_da_percent) || 48.06,
          comp,
        });
        continue;
      }

      const rawPayDaysFromAttendance = resolvePayDaysFromAttendance({
        presentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        eligibleDays: eligibleCalendarDays,
        holidayPayDays,
      });
      const payDays = Math.max(0, rawPayDaysFromAttendance);
      const rawPayDays = payDays;

      const grossMonthly = Number(m.gross_salary) || 0;
      if (grossMonthly <= 0) continue;

      const ratio = payDays / Math.max(1, daysInMonth);
      const grossPay = payDays > 0 ? Math.round((grossMonthly * payDays) / Math.max(1, daysInMonth)) : 0;
      const mb = Number(m.basic) ?? 0;
      const mh = Number(m.hra) ?? 0;
      const mm = Number(m.medical) ?? 0;
      const mt = Number(m.trans) ?? 0;
      const ml = Number(m.lta) ?? 0;
      const mp = Number(m.personal) ?? 0;
      const componentsSum = mb + mh + mm + mt + ml + mp;
      const basicPay = componentsSum > 0 ? Math.round(mb * ratio) : Math.round(grossPay * 0.5);
      const hraPay = componentsSum > 0 ? Math.round(mh * ratio) : Math.round(grossPay * 0.2);
      const medicalPay = componentsSum > 0 ? Math.round(mm * ratio) : Math.round(grossPay * 0.05);
      const transPay = componentsSum > 0 ? Math.round(mt * ratio) : Math.round(grossPay * 0.05);
      const ltaPay = componentsSum > 0 ? Math.round(ml * ratio) : Math.round(grossPay * 0.1);
      const personalPay = componentsSum > 0 ? Math.round(mp * ratio) : Math.round(grossPay * 0.1);
      const masterPtIns = m.pt != null ? Number(m.pt) : NaN;
      const profTaxIns = Number.isFinite(masterPtIns) && masterPtIns >= 0 ? masterPtIns : ptFixed;
      const profTaxMonthlyRoundedRun = Math.round(profTaxIns);
      const statRun = privateStatutoryMonthlyFromMaster(m, profTaxMonthlyRoundedRun, privateCfgRun, u);
      const pfEmp = Math.round(statRun.pfEmp * (payDays / Math.max(1, daysInMonth)));
      const pfEmpr = Math.round(statRun.pfEmpr * (payDays / Math.max(1, daysInMonth)));
      const esicEmp = Math.round(statRun.esicEmp * (payDays / Math.max(1, daysInMonth)));
      const esicEmpr = Math.round(statRun.esicEmpr * (payDays / Math.max(1, daysInMonth)));
      const deductions = pfEmp + esicEmp + profTaxIns;
      const netPay = grossPay - deductions;
      const tdsMonthIns = Number(m.tds) || 0;
      const advMonthIns = Number(m.advance_bonus) || 0;
      const incentiveIns = Math.round(advMonthIns * ratio);
      // TDS should match Payroll Master (monthly), not prorated by pay-days.
      const tdsIns = Math.round(tdsMonthIns);
      const prBonusIns = 0;
      const reimbursement = Math.round(reimbByUser.get(m.employee_user_id) || 0);
      const takeHomeIns = netPay - tdsIns + incentiveIns + prBonusIns + reimbursement;

      payslips.push({
        payroll_mode: "private",
        company_id: me.company_id,
        employee_id: null,
        employee_user_id: m.employee_user_id,
        payroll_period_id: period.id,
        basic: basicPay,
        hra: hraPay,
        medical: medicalPay,
        trans: transPay,
        lta: ltaPay,
        personal: personalPay,
        allowances: 0,
        deductions,
        gross_pay: grossPay,
        net_pay: takeHomeIns,
        pay_days: payDays,
        ctc: Math.round(statRun.ctc),
        pf_employee: pfEmp,
        pf_employer: pfEmpr,
        esic_employee: esicEmp,
        esic_employer: esicEmpr,
        professional_tax: profTaxIns,
        incentive: incentiveIns,
        pr_bonus: prBonusIns,
        reimbursement,
        tds: tdsIns,
        bank_name: u?.bank_name ?? null,
        bank_account_number: u?.bank_account_number ?? null,
        bank_ifsc: u?.bank_ifsc ?? null,
      });
    }
  }

  if (payslips.length) {
    const { data: insertedSlips, error: slipErr } = await supabase.from("HRMS_payslips").insert(payslips).select("id, employee_user_id");
    if (slipErr) return NextResponse.json({ error: slipErr.message }, { status: 400 });
    if (govLines.length && insertedSlips?.length) {
      const slipByUser = new Map((insertedSlips as { id: string; employee_user_id: string }[]).map((s) => [s.employee_user_id, s.id]));
      const monthYmd = `${year}-${String(month).padStart(2, "0")}-01`;
      const govInserts = govLines
        .map((g) => {
          const slipId = slipByUser.get(g.employeeUserId);
          if (!slipId) return null;
          const c = g.comp;
          const slab = c.transportSlab;
          return {
            company_id: me.company_id,
            payroll_period_id: period.id,
            payroll_master_id: g.masterId,
            employee_user_id: g.employeeUserId,
            payslip_id: slipId,
            month_year: monthYmd,
            salary_date: periodEnd,
            days_in_month: daysInMonth,
            paid_days: Math.max(0, daysInMonth - g.unpaidDays),
            unpaid_days: g.unpaidDays,
            pay_level: g.payLevel,
            transport_slab_group: slab.transportSlabGroup,
            transport_base: slab.transportBase,
            transport_da_percent: g.transportDaPercent,
            basic_actual: c.basicActual,
            basic_paid: c.basicPaid,
            sp_pay_actual: c.spPayActual,
            sp_pay_paid: c.spPayPaid,
            da_actual: c.daActual,
            da_paid: c.daPaid,
            transport_actual: c.transportActual,
            transport_paid: c.transportPaid,
            hra_actual: c.hraActual,
            hra_paid: c.hraPaid,
            medical_actual: c.medicalActual,
            medical_paid: c.medicalPaid,
            extra_work_allowance_actual: c.extraWorkAllowanceActual,
            extra_work_allowance_paid: c.extraWorkAllowancePaid,
            night_allowance_actual: c.nightAllowanceActual,
            night_allowance_paid: c.nightAllowancePaid,
            uniform_allowance_actual: c.uniformAllowanceActual,
            uniform_allowance_paid: c.uniformAllowancePaid,
            education_allowance_actual: c.educationAllowanceActual,
            education_allowance_paid: c.educationAllowancePaid,
            da_arrears_actual: c.daArrearsActual,
            da_arrears_paid: c.daArrearsPaid,
            transport_arrears_actual: c.transportArrearsActual,
            transport_arrears_paid: c.transportArrearsPaid,
            encashment_actual: c.encashmentActual,
            encashment_paid: c.encashmentPaid,
            encashment_da_actual: c.encashmentDaActual,
            encashment_da_paid: c.encashmentDaPaid,
            income_tax_amount: c.deductions.incomeTax,
            pt_amount: c.deductions.pt,
            lic_amount: c.deductions.lic,
            cpf_amount: c.deductions.cpf,
            da_cpf_amount: c.deductions.daCpf,
            vpf_amount: c.deductions.vpf,
            pf_loan_amount: c.deductions.pfLoan,
            post_office_amount: c.deductions.postOffice,
            credit_society_amount: c.deductions.creditSociety,
            std_licence_fee_amount: c.deductions.stdLicenceFee,
            electricity_amount: c.deductions.electricity,
            water_amount: c.deductions.water,
            mess_amount: c.deductions.mess,
            horticulture_amount: c.deductions.horticulture,
            welfare_amount: c.deductions.welfare,
            veh_charge_amount: c.deductions.vehCharge,
            other_deduction_amount: c.deductions.other,
            total_earnings: c.totalEarnings,
            total_deductions: c.totalDeductions,
            net_salary: c.netSalary,
          };
        })
        .filter(Boolean);
      const mErr = govInserts.length
        ? (await supabase.from("HRMS_government_monthly_payroll").insert(govInserts as any[])).error
        : null;
      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
    }
  }

  try {
    await markReimbursementsPaidForPayrollMonth(me.company_id, period.id, year, month);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update reimbursement status" }, { status: 400 });
  }

  let excelPath: string | null = null;
  if (payslips.length) {
    excelPath = await persistPayrollExcelWorkbook(me.company_id, period.id, year, month, periodEnd);
  }

  return NextResponse.json({
    ok: true,
    periodId: period.id,
    periodName,
    periodStart,
    periodEnd,
    payslipsGenerated: payslips.length,
    excelPath: excelPath ?? undefined,
  });
}
