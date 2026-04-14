/**
 * Payroll calculation formulas (aligned with common Indian statutory practice)
 *
 * PF (EPF employee / employer contribution — same formula used for both here):
 *   PF wage ≈ Gross − HRA (Basic+DA proxy from default split).
 *   If PF wage ≤ ₹15,000: 12% of PF wage (no cap).
 *   If PF wage > ₹15,000: employee contribution capped at ₹1,800/month (12% of ₹15,000).
 *
 * ESIC: Applies when gross monthly ≤ ₹21,000 (inclusive). Rates on gross:
 *   Employee 0.75%, Employer 3.25% (e.g. ₹20,000 → ₹150 + ₹650).
 *
 * Salary breakup defaults: Basic 50%, HRA 20%, Medical 5%, Trans 5%, LTA 10%, Personal 10%
 *
 * CTC = Gross + Employer PF + Employer ESIC
 * Take home (approx.) = Gross − Employee PF − Employee ESIC − PT
 */

import type { PrivatePayrollConfig } from "@/lib/payrollConfig";
import { DEFAULT_PRIVATE_PAYROLL_CONFIG } from "@/lib/payrollConfig";

/** ESIC applies when gross is at most this (inclusive) when using defaults. */
export const ESIC_GROSS_MAX_INCLUSIVE = DEFAULT_PRIVATE_PAYROLL_CONFIG.esicGrossCeilingInclusive;

export function computePfWage(gross: number, hra: number): number {
  return Math.max(0, gross - hra);
}

export function computePf(gross: number, hra: number, pfEligible: boolean, cfg?: PrivatePayrollConfig): number {
  if (!pfEligible) return 0;
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const base = computePfWage(gross, hra);
  if (base > c.pfWageCap) return Math.round(c.pfCap);
  return Math.round(base * c.pfRate);
}

/** True when EPF typically mandatory: PF wage (gross − HRA) ≤ ₹15,000. */
export function isPfStatutorilyMandatory(gross: number, hra: number): boolean {
  const g = Number(gross) || 0;
  if (g <= 0) return false;
  return computePfWage(g, hra) <= DEFAULT_PRIVATE_PAYROLL_CONFIG.pfWageCap;
}

/** True when gross is within ESIC ceiling (inclusive). */
export function isWithinEsicGrossCeiling(gross: number, cfg?: PrivatePayrollConfig): boolean {
  const g = Number(gross) || 0;
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  return g > 0 && g <= c.esicGrossCeilingInclusive;
}

export function computeEsicEmployee(gross: number, esicEligible: boolean, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  if (!esicEligible || !isWithinEsicGrossCeiling(gross, c)) return 0;
  return Math.round(gross * c.esicEmployeeRate);
}

export function computeEsicEmployer(gross: number, esicEligible: boolean, cfg?: PrivatePayrollConfig): number {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  if (!esicEligible || !isWithinEsicGrossCeiling(gross, c)) return 0;
  return Math.round(gross * c.esicEmployerRate);
}

export function defaultSalaryBreakup(gross: number, cfg?: PrivatePayrollConfig): {
  basic: number;
  hra: number;
  medical: number;
  trans: number;
  lta: number;
  personal: number;
} {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  return {
    basic: Math.round(gross * c.breakupPct.basicPct),
    hra: Math.round(gross * c.breakupPct.hraPct),
    medical: Math.round(gross * c.breakupPct.medicalPct),
    trans: Math.round(gross * c.breakupPct.transPct),
    lta: Math.round(gross * c.breakupPct.ltaPct),
    personal: Math.round(gross * c.breakupPct.personalPct),
  };
}

export function computePayrollFromGross(
  gross: number,
  pfEligible: boolean,
  esicEligible: boolean,
  ptMonthly: number,
  salaryBreakup?: { basic?: number; hra?: number; medical?: number; trans?: number; lta?: number; personal?: number },
  cfg?: PrivatePayrollConfig,
) {
  const c = cfg ?? DEFAULT_PRIVATE_PAYROLL_CONFIG;
  const components = salaryBreakup?.hra != null
    ? {
        basic: salaryBreakup.basic ?? Math.round(gross * c.breakupPct.basicPct),
        hra: salaryBreakup.hra ?? Math.round(gross * c.breakupPct.hraPct),
        medical: salaryBreakup.medical ?? Math.round(gross * c.breakupPct.medicalPct),
        trans: salaryBreakup.trans ?? Math.round(gross * c.breakupPct.transPct),
        lta: salaryBreakup.lta ?? Math.round(gross * c.breakupPct.ltaPct),
        personal: salaryBreakup.personal ?? Math.round(gross * c.breakupPct.personalPct),
      }
    : defaultSalaryBreakup(gross, c);

  const pfEmp = computePf(gross, components.hra, pfEligible, c);
  const pfEmpr = computePf(gross, components.hra, pfEligible, c);
  const esicEmp = computeEsicEmployee(gross, esicEligible, c);
  const esicEmpr = computeEsicEmployer(gross, esicEligible, c);
  const ctc = gross + pfEmpr + esicEmpr;
  const takeHome = gross - pfEmp - esicEmp - ptMonthly;

  return {
    ...components,
    pfEmp,
    pfEmpr,
    esicEmp,
    esicEmpr,
    ctc,
    takeHome: Math.max(0, takeHome),
  };
}
