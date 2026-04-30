export type PrivatePayrollBreakupPct = {
  basicPct: number;
  hraPct: number;
  medicalPct: number;
  transPct: number;
  ltaPct: number;
  personalPct: number;
};

export type PrivatePayrollPtSlab = {
  /** Inclusive lower bound for gross (monthly). */
  minInclusive: number;
  /** Exclusive upper bound; null means infinity. */
  maxExclusive: number | null;
  /** PT amount (monthly). */
  amount: number;
};

export type PrivatePayrollConfig = {
  pfRate: number;
  pfWageCap: number;
  pfCap: number;
  esicEmployeeRate: number;
  esicEmployerRate: number;
  /** Max Basic+DA (monthly) for ESIC contributions (same as statutory “₹21,000” gross threshold, applied to wage column E). */
  esicWageCeilingInclusive: number;
  /**
   * If true, ESIC can be applied even when Basic+DA is above the ceiling,
   * as long as the user explicitly marks ESIC eligible (manual override).
   */
  esicApplyAboveCeilingWhenEligible?: boolean;
  ptMonthlyDefault: number;
  ptMode?: "fixed" | "slab";
  ptSlabs?: PrivatePayrollPtSlab[];
  breakupPct: PrivatePayrollBreakupPct;
  /** HRA = basicDa × rate when (basicDa × rate) ≥ threshold; otherwise 0 (common ₹6,000 floor on the HRA amount). */
  hraRateOnBasicDa: number;
  hraZeroWhenPotentialHraBelow: number;
  /** IF(gross×basic% ≤ floor, Basic+DA = floor, else ROUND(gross×basic%)). */
  basicDaFloorWhenHalfGrossLow: number;
  /** Advance bonus column (stored as `medical`): ROUND(Basic+DA × rate). Default 8.33%. */
  advanceBonusRateOnBasic: number;
  /**
   * Private payslip earnings layout (labels/visible heads).
   * Stored in company payroll config so new periods can adopt a new format without changing old payslips.
   */
  payslipEarningsMode?: "classic" | "basic_hra_advance_special";
  /** YYYY-MM; applies when slip periodMonth >= this value. Empty/invalid means "do not switch". */
  payslipEarningsEffectiveFromYm?: string;
};

export const DEFAULT_PRIVATE_PAYROLL_CONFIG: PrivatePayrollConfig = {
  pfRate: 0.12,
  pfWageCap: 15000,
  pfCap: 1800,
  esicEmployeeRate: 0.0075,
  esicEmployerRate: 0.0325,
  esicWageCeilingInclusive: 21000,
  // Excel/statutory behaviour: ESIC applies only when Basic+DA is within ceiling (≤ 21,000).
  esicApplyAboveCeilingWhenEligible: false,
  ptMonthlyDefault: 200,
  // Default to slabs (matches common PT practice and PowerApps logic used in this project).
  ptMode: "slab",
  ptSlabs: [
    { minInclusive: 0, maxExclusive: 6000, amount: 0 },
    { minInclusive: 6000, maxExclusive: 9000, amount: 80 },
    { minInclusive: 9000, maxExclusive: 12000, amount: 150 },
    { minInclusive: 12000, maxExclusive: null, amount: 200 },
  ],
  // Basic is typically 50% of gross; HRA follows `hraRateOnBasicDa` + floor rule; remainder is special allowance (personal).
  breakupPct: {
    basicPct: 0.5,
    hraPct: 0,
    medicalPct: 0,
    transPct: 0,
    ltaPct: 0,
    personalPct: 0,
  },
  hraRateOnBasicDa: 0.4,
  hraZeroWhenPotentialHraBelow: 6000,
  basicDaFloorWhenHalfGrossLow: 14290,
  advanceBonusRateOnBasic: 0.0833,
  payslipEarningsMode: "classic",
  payslipEarningsEffectiveFromYm: "",
};

function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function pct(v: unknown): number | null {
  const x = n(v);
  if (x == null) return null;
  // allow values like 50 (meaning 50%) or 0.5
  const y = x > 1 ? x / 100 : x;
  return clamp(y, 0, 1);
}

function ptSlab(raw: unknown): PrivatePayrollPtSlab | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const min = n(r.minInclusive);
  const max = r.maxExclusive === null ? null : n(r.maxExclusive);
  const amt = n(r.amount);
  if (min == null || min < 0) return null;
  if (max != null && (max <= min || max < 0)) return null;
  if (amt == null || amt < 0) return null;
  return { minInclusive: Math.round(min), maxExclusive: max == null ? null : Math.round(max), amount: Math.round(amt) };
}

export function computeProfessionalTaxMonthly(grossMonthly: number, cfg: PrivatePayrollConfig, fallbackFixed?: number): number {
  const g = Math.max(0, Math.round(Number(grossMonthly) || 0));
  const mode = (cfg.ptMode ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.ptMode) as "fixed" | "slab";
  const fixed = Math.max(
    0,
    Math.round(
      Number.isFinite(Number(fallbackFixed))
        ? (Number(fallbackFixed) as number)
        : (cfg.ptMonthlyDefault ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.ptMonthlyDefault),
    ),
  );
  if (mode !== "slab") return fixed;
  const slabs = Array.isArray(cfg.ptSlabs) && cfg.ptSlabs.length ? cfg.ptSlabs : DEFAULT_PRIVATE_PAYROLL_CONFIG.ptSlabs!;
  for (const s of slabs) {
    const min = Math.max(0, Math.round(Number(s.minInclusive) || 0));
    const max = s.maxExclusive == null ? null : Math.round(Number(s.maxExclusive) || 0);
    if (g < min) continue;
    if (max != null && g >= max) continue;
    return Math.max(0, Math.round(Number(s.amount) || 0));
  }
  return fixed;
}

/** Normalize untrusted JSON from DB/API into a safe config. */
export function normalizePrivatePayrollConfig(raw: unknown): PrivatePayrollConfig {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bp = (r.breakupPct && typeof r.breakupPct === "object" ? (r.breakupPct as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const ptModeRaw = typeof r.ptMode === "string" ? r.ptMode : undefined;
  const ptMode = ptModeRaw === "fixed" ? "fixed" : "slab";
  const ptSlabsRaw = Array.isArray(r.ptSlabs) ? r.ptSlabs : [];
  const ptSlabs = (ptSlabsRaw.map(ptSlab).filter(Boolean) as PrivatePayrollPtSlab[]).slice(0, 20);

  const breakupPct: PrivatePayrollBreakupPct = {
    basicPct: pct(bp.basicPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.basicPct,
    hraPct: pct(bp.hraPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.hraPct,
    medicalPct: pct(bp.medicalPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.medicalPct,
    transPct: pct(bp.transPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.transPct,
    ltaPct: pct(bp.ltaPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.ltaPct,
    personalPct: pct(bp.personalPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.personalPct,
  };

  const hraRateOnBasicDa = clamp(
    n(r.hraRateOnBasicDa) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.hraRateOnBasicDa,
    0,
    1,
  );
  const hraZeroWhenPotentialHraBelow = Math.max(
    0,
    n(r.hraZeroWhenPotentialHraBelow) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.hraZeroWhenPotentialHraBelow,
  );

  const basicDaFloorWhenHalfGrossLow = Math.max(
    0,
    n(r.basicDaFloorWhenHalfGrossLow) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.basicDaFloorWhenHalfGrossLow,
  );
  const advanceBonusRateOnBasic = clamp(
    n(r.advanceBonusRateOnBasic) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.advanceBonusRateOnBasic,
    0,
    1,
  );

  const payslipEarningsModeRaw = typeof r.payslipEarningsMode === "string" ? r.payslipEarningsMode : "";
  const payslipEarningsMode =
    payslipEarningsModeRaw === "basic_hra_advance_special" ? "basic_hra_advance_special" : "classic";
  const payslipEarningsEffectiveFromYmRaw =
    typeof r.payslipEarningsEffectiveFromYm === "string" ? r.payslipEarningsEffectiveFromYm.trim() : "";
  const payslipEarningsEffectiveFromYm =
    /^\d{4}-\d{2}$/.test(payslipEarningsEffectiveFromYmRaw) ? payslipEarningsEffectiveFromYmRaw : "";

  return {
    pfRate: clamp(n(r.pfRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfRate, 0, 1),
    pfWageCap: Math.max(0, n(r.pfWageCap) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfWageCap),
    pfCap: Math.max(0, n(r.pfCap) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfCap),
    esicEmployeeRate: clamp(n(r.esicEmployeeRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicEmployeeRate, 0, 1),
    esicEmployerRate: clamp(n(r.esicEmployerRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicEmployerRate, 0, 1),
    esicWageCeilingInclusive: Math.max(
      0,
      n(r.esicWageCeilingInclusive) ??
        n(r.esicGrossCeilingInclusive) ??
        DEFAULT_PRIVATE_PAYROLL_CONFIG.esicWageCeilingInclusive,
    ),
    esicApplyAboveCeilingWhenEligible:
      typeof r.esicApplyAboveCeilingWhenEligible === "boolean"
        ? r.esicApplyAboveCeilingWhenEligible
        : DEFAULT_PRIVATE_PAYROLL_CONFIG.esicApplyAboveCeilingWhenEligible,
    ptMonthlyDefault: Math.max(0, n(r.ptMonthlyDefault) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.ptMonthlyDefault),
    ptMode,
    ptSlabs: ptSlabs.length ? ptSlabs : DEFAULT_PRIVATE_PAYROLL_CONFIG.ptSlabs,
    breakupPct,
    hraRateOnBasicDa,
    hraZeroWhenPotentialHraBelow,
    basicDaFloorWhenHalfGrossLow,
    advanceBonusRateOnBasic,
    payslipEarningsMode,
    payslipEarningsEffectiveFromYm,
  };
}

