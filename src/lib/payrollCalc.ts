/**
 * Payroll calculation formulas (aligned with common Indian statutory practice)
 *
 * PF (EPF employee / employer contribution — same formula used for both here):
 *   PF wage ≈ Gross − HRA (Basic+DA proxy from default split).
 *   If PF wage ≤ ₹15,000: 12% of PF wage (no cap).
 *   If PF wage > ₹15,000: employee contribution capped at ₹1,800/month (12% of ₹15,000).
 *
 * ESIC (matches sheet): wage base = Basic+DA (column E). Employee ROUNDUP(base × 0.75%, 0), employer ROUNDUP(base × 3.25%, 0)
 * when Basic+DA ≤ configured ceiling (default ₹21,000 inclusive) and ESIC eligible.
 *
 * Default private salary structure (monthly gross D):
 *   Basic+DA (E) = ROUND(IF(D×50% ≤ 14290, 14290, D×50%), 0) — floor `basicDaFloorWhenHalfGrossLow` (default 14290)
 *   HRA (F) = IF(E×40% < ₹6,000, 0, E×40%)
 *   Advance bonus (G, stored as `medical`) = ROUND(E × 8.33%)
 *   Special allowance (H, `personal`) = D − E − F − G (remainder)
 *
 * CTC = Gross + Employer PF + Employer ESIC
 * Take home (approx.) = Gross − Employee PF − Employee ESIC − PT
 */

import type { PrivatePayrollConfig } from "@/lib/payrollConfig";
import { DEFAULT_PRIVATE_PAYROLL_CONFIG } from "@/lib/payrollConfig";

/** Max Basic+DA for ESIC (default ₹21,000). */
export const ESIC_WAGE_MAX_INCLUSIVE = DEFAULT_PRIVATE_PAYROLL_CONFIG.esicWageCeilingInclusive;

/** @deprecated Use ESIC_WAGE_MAX_INCLUSIVE — ESIC is based on Basic+DA, not gross. */
export const ESIC_GROSS_MAX_INCLUSIVE = ESIC_WAGE_MAX_INCLUSIVE;

export function computePfWage(gross: number, hra: number): number {
  return Math.max(0, gross - hra);
}

/** PF based on Basic+DA (Excel sheet column E), capped at `pfCap` (₹1,800). */
export function computePfFromBasicDa(basicDa: number, pfEligible: boolean, cfg?: PrivatePayrollConfig): number {
  if (!pfEligible) return 0;
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const base = Math.max(0, Math.round(Number(basicDa) || 0));
  const raw = base * c.pfRate;
  if (raw >= c.pfCap) return Math.round(c.pfCap);
  return Math.round(raw);
}

export function computePf(gross: number, hra: number, pfEligible: boolean, cfg?: PrivatePayrollConfig): number {
  // Backward-compatible wrapper: prefer Basic+DA based PF (Excel), ignore HRA.
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const basicDa = computeBasicDaFromGross(gross, c);
  return computePfFromBasicDa(basicDa, pfEligible, c);
}

/** True when EPF typically mandatory: PF wage (gross − HRA) ≤ ₹15,000. */
export function isPfStatutorilyMandatory(gross: number, hra: number): boolean {
  const g = Number(gross) || 0;
  if (g <= 0) return false;
  // Align with Basic+DA base used for PF in this project.
  const basicDa = computeBasicDaFromGross(g, DEFAULT_PRIVATE_PAYROLL_CONFIG);
  return basicDa <= DEFAULT_PRIVATE_PAYROLL_CONFIG.pfWageCap;
}

/** ESIC applies when Basic+DA is within ₹1 … ceiling (inclusive), matching IF(E&lt;21001,…) with ceiling 21000. */
export function isWithinEsicWageCeiling(basicDa: number, cfg?: PrivatePayrollConfig): boolean {
  const w = Math.max(0, Math.round(Number(basicDa) || 0));
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const maxInclusive = c.esicWageCeilingInclusive ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicWageCeilingInclusive;
  return w >= 1 && w <= maxInclusive;
}

/** @deprecated Prefer isWithinEsicWageCeiling(Basic+DA). Kept for callers passing gross — approximates via default Basic split. */
export function isWithinEsicGrossCeiling(gross: number, cfg?: PrivatePayrollConfig): boolean {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const basic = computeBasicDaFromGross(gross, c);
  return isWithinEsicWageCeiling(basic, c);
}

/** Employee ESIC: ROUNDUP(wage × 0.75%, 0) when eligible and wage in band. */
export function computeEsicEmployee(esicWageBase: number, esicEligible: boolean, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  // Excel/statutory: apply only when eligible AND Basic+DA ≤ ceiling (≤ 21,000)
  if (!esicEligible || !isWithinEsicWageCeiling(esicWageBase, c)) return 0;
  const w = Math.max(0, Math.round(Number(esicWageBase) || 0));
  const raw = w * c.esicEmployeeRate;
  return Math.ceil(raw - 1e-12);
}

/** Employer ESIC: ROUNDUP(wage × 3.25%, 0) when eligible and wage in band. */
export function computeEsicEmployer(esicWageBase: number, esicEligible: boolean, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  // Excel/statutory: apply only when eligible AND Basic+DA ≤ ceiling (≤ 21,000)
  if (!esicEligible || !isWithinEsicWageCeiling(esicWageBase, c)) return 0;
  const w = Math.max(0, Math.round(Number(esicWageBase) || 0));
  const raw = w * c.esicEmployerRate;
  return Math.ceil(raw - 1e-12);
}

/**
 * Basic+DA — Excel: `=ROUND(IF(D4*50%<=14290,14290,D4*50%),0)` with configurable floor and basic %.
 */
export function computeBasicDaFromGross(gross: number, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const bp = c.breakupPct.basicPct ?? 0.5;
  const floor = c.basicDaFloorWhenHalfGrossLow ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.basicDaFloorWhenHalfGrossLow;
  const rawHalf = g * bp;
  return Math.round(rawHalf <= floor ? floor : rawHalf);
}

/**
 * HRA rule (Excel): if (Basic+DA × rate) is below the threshold, HRA is 0;
 * otherwise HRA = Basic+DA × rate (rounded).
 */
export function computeHraFromBasicDa(basicDa: number, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const base = Math.max(0, Math.round(Number(basicDa) || 0));
  const rate = c.hraRateOnBasicDa ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.hraRateOnBasicDa;
  const threshold = c.hraZeroWhenPotentialHraBelow ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.hraZeroWhenPotentialHraBelow;
  const potential = base * rate;
  if (potential < threshold) return 0;
  return Math.round(potential);
}

export type PrivateSalaryBreakup = {
  basic: number;
  hra: number;
  medical: number;
  trans: number;
  lta: number;
  personal: number;
};

export type PrivateSalaryBreakupInput = Partial<PrivateSalaryBreakup>;

function resolveSalaryComponentsForPrivate(
  gross: number,
  salaryBreakup: PrivateSalaryBreakupInput | undefined,
  cfg: PrivatePayrollConfig,
): PrivateSalaryBreakup {
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const defaults = defaultSalaryBreakup(gross, cfg);
  if (!salaryBreakup) return defaults;

  const hasAny = (["basic", "hra", "medical", "trans", "lta", "personal"] as const).some(
    (k) => salaryBreakup[k] != null && Number.isFinite(Number(salaryBreakup[k])),
  );
  if (!hasAny) return defaults;

  const basic =
    salaryBreakup.basic != null && Number.isFinite(Number(salaryBreakup.basic))
      ? Math.round(Number(salaryBreakup.basic))
      : defaults.basic;
  const hra =
    salaryBreakup.hra != null && Number.isFinite(Number(salaryBreakup.hra))
      ? Math.round(Number(salaryBreakup.hra))
      : computeHraFromBasicDa(basic, cfg);
  const bonusRate = cfg.advanceBonusRateOnBasic ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.advanceBonusRateOnBasic;
  const medical =
    salaryBreakup.medical != null && Number.isFinite(Number(salaryBreakup.medical))
      ? Math.round(Number(salaryBreakup.medical))
      : Math.round(basic * bonusRate);
  const trans =
    salaryBreakup.trans != null && Number.isFinite(Number(salaryBreakup.trans))
      ? Math.round(Number(salaryBreakup.trans))
      : 0;
  const lta =
    salaryBreakup.lta != null && Number.isFinite(Number(salaryBreakup.lta)) ? Math.round(Number(salaryBreakup.lta)) : 0;
  const personal =
    salaryBreakup.personal != null && Number.isFinite(Number(salaryBreakup.personal))
      ? Math.round(Number(salaryBreakup.personal))
      : Math.max(0, g - basic - hra - medical - trans - lta);

  return { basic, hra, medical, trans, lta, personal };
}

/** Default component split for private payroll (Excel template). */
export function defaultSalaryBreakup(gross: number, cfg?: PrivatePayrollConfig): PrivateSalaryBreakup {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const basic = computeBasicDaFromGross(gross, c);
  const hra = computeHraFromBasicDa(basic, c);
  const bonusRate = c.advanceBonusRateOnBasic ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.advanceBonusRateOnBasic;
  const medical = Math.round(basic * bonusRate);
  const trans = 0;
  const lta = 0;
  const personal = Math.max(0, g - basic - hra - medical - trans - lta);
  return { basic, hra, medical, trans, lta, personal };
}

export function computePayrollFromGross(
  gross: number,
  pfEligible: boolean,
  esicEligible: boolean,
  ptMonthly: number,
  salaryBreakup?: PrivateSalaryBreakupInput,
  cfg?: PrivatePayrollConfig,
) {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const components = resolveSalaryComponentsForPrivate(gross, salaryBreakup, c);

  const grossTotal = Math.round(
    components.basic + components.hra + components.medical + components.trans + components.lta + components.personal,
  );

  // Employee PF: IF(pfEligible, IF(BasicDA*12%<1801, ROUND(BasicDA*12%), 1800), 0)
  const pfEmp = computePfFromBasicDa(components.basic, pfEligible, c);
  // Employer PF: IF(pfEligible, ROUND(EmployeePF/12*13), 0)
  const pfEmpr = pfEligible ? Math.round((pfEmp / 12) * 13) : 0;

  const esicWage = components.basic;
  const esicEmp = computeEsicEmployee(esicWage, esicEligible, c);
  const esicEmpr = computeEsicEmployer(esicWage, esicEligible, c);

  // Net Salary / Take Home: GrossTotal − PT − EmployeePF − EmployeeESIC
  const takeHome = grossTotal - pfEmp - esicEmp - ptMonthly;
  // Final CTC: GrossTotal + EmployerPF + EmployerESIC
  const ctc = grossTotal + pfEmpr + esicEmpr;

  return {
    ...components,
    grossTotal,
    pfEmp,
    pfEmpr,
    esicEmp,
    esicEmpr,
    ctc,
    takeHome: Math.max(0, takeHome),
  };
}

/**
 * Bank take-home for private payroll run preview / payslips:
 * net salary (gross − statutory deductions) − TDS + incentive + bonus + reimbursement.
 */
export function computePrivateTakeHome(params: {
  netPay: number;
  tds: number;
  incentive?: number;
  prBonus?: number;
  reimbursement?: number;
}): number {
  const netPay = Math.max(0, Math.round(Number(params.netPay) || 0));
  const tds = Math.max(0, Math.round(Number(params.tds) || 0));
  const incentive = Math.round(Number(params.incentive) || 0);
  const prBonus = Math.round(Number(params.prBonus) || 0);
  const reimbursement = Math.round(Number(params.reimbursement) || 0);
  return Math.max(0, netPay - tds) + incentive + prBonus + reimbursement;
}

/**
 * CTC for a payroll period (not full month): prorated gross + employer PF + employer ESIC (+ incentive/bonus if included in CTC).
 */
/** Full-calendar-month CTC (gross + employer contributions) for comparison with prorated period pay. */
export function computePrivateMonthlyCtc(params: {
  grossMonthly: number;
  pfEmployerMonthly: number;
  esicEmployerMonthly: number;
  incentiveMonthly?: number;
  prBonusMonthly?: number;
}): number {
  return computePrivatePeriodCtc({
    grossPay: params.grossMonthly,
    pfEmployer: params.pfEmployerMonthly,
    esicEmployer: params.esicEmployerMonthly,
    incentive: params.incentiveMonthly,
    prBonus: params.prBonusMonthly,
  }).ctc;
}

export function computePrivatePeriodCtc(params: {
  grossPay: number;
  pfEmployer: number;
  esicEmployer: number;
  incentive?: number;
  prBonus?: number;
}): { ctcBase: number; ctc: number } {
  const ctcBase = Math.round(
    Math.max(0, Number(params.grossPay) || 0) +
      Math.max(0, Number(params.pfEmployer) || 0) +
      Math.max(0, Number(params.esicEmployer) || 0),
  );
  const incentive = Math.round(Number(params.incentive) || 0);
  const prBonus = Math.round(Number(params.prBonus) || 0);
  return { ctcBase, ctc: ctcBase + incentive + prBonus };
}

/** Reverse `computePrivateTakeHome` when `net_pay` on a payslip is stored as final take-home. */
export function netPayBeforeVariableLines(params: {
  takeHome: number;
  tds: number;
  incentive?: number;
  prBonus?: number;
  reimbursement?: number;
}): number {
  const takeHome = Math.round(Number(params.takeHome) || 0);
  const tds = Math.max(0, Math.round(Number(params.tds) || 0));
  const incentive = Math.round(Number(params.incentive) || 0);
  const prBonus = Math.round(Number(params.prBonus) || 0);
  const reimbursement = Math.round(Number(params.reimbursement) || 0);
  return Math.max(0, takeHome + tds - incentive - prBonus - reimbursement);
}

/** PT for a month: fixed rupees or recomputed from gross each iteration (slab PT). */
export type ProfessionalTaxInput = number | ((grossForSlab: number) => number);

function resolveProfessionalTax(pt: ProfessionalTaxInput, gross: number): number {
  return typeof pt === "function" ? pt(gross) : pt;
}

/**
 * When monthly CTC is fixed (CTC includes employer PF/ESIC), derive the gross that fits:
 *   CTC = Gross + EmployerPF(Gross) + EmployerESIC(Gross)
 *
 * Pass `professionalTax` as a function of gross when PT slabs depend on monthly gross.
 */
export function computePayrollFromCtc(
  ctcMonthly: number,
  pfEligible: boolean,
  esicEligible: boolean,
  professionalTax: ProfessionalTaxInput,
  salaryBreakup?: PrivateSalaryBreakupInput,
  cfg?: PrivatePayrollConfig,
) {
  const target = Math.max(0, Math.round(Number(ctcMonthly) || 0));
  if (target <= 0) {
    const pt0 = resolveProfessionalTax(professionalTax, 0);
    const empty = computePayrollFromGross(0, pfEligible, esicEligible, pt0, salaryBreakup, cfg);
    return { ...empty, gross: 0, ctcTarget: target };
  }

  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  // Brute-force search (Excel-aligned) for a gross where FinalCTC === target.
  const start = target;
  const minGross = Math.max(0, target - 10000);

  let best: { gross: number; calc: ReturnType<typeof computePayrollFromGross> } | null = null;
  for (let g = start; g >= minGross; g--) {
    const pt = resolveProfessionalTax(professionalTax, g);
    const calc = computePayrollFromGross(g, pfEligible, esicEligible, pt, salaryBreakup, c);
    if (calc.ctc === target) return { ...calc, gross: g, ctc: target, ctcTarget: target };
    if (calc.ctc < target) {
      if (!best || calc.ctc > best.calc.ctc) best = { gross: g, calc };
    }
  }

  // Fallback: pick nearest lower (or last computed) and return.
  if (best) return { ...best.calc, gross: best.gross, ctc: target, ctcTarget: target };
  const pt0 = resolveProfessionalTax(professionalTax, 0);
  const fallback = computePayrollFromGross(0, pfEligible, esicEligible, pt0, salaryBreakup, c);
  return { ...fallback, gross: 0, ctc: target, ctcTarget: target };
}
