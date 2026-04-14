export type PrivatePayrollBreakupPct = {
  basicPct: number;
  hraPct: number;
  medicalPct: number;
  transPct: number;
  ltaPct: number;
  personalPct: number;
};

export type PrivatePayrollConfig = {
  pfRate: number;
  pfWageCap: number;
  pfCap: number;
  esicEmployeeRate: number;
  esicEmployerRate: number;
  esicGrossCeilingInclusive: number;
  ptMonthlyDefault: number;
  breakupPct: PrivatePayrollBreakupPct;
};

export const DEFAULT_PRIVATE_PAYROLL_CONFIG: PrivatePayrollConfig = {
  pfRate: 0.12,
  pfWageCap: 15000,
  pfCap: 1800,
  esicEmployeeRate: 0.0075,
  esicEmployerRate: 0.0325,
  esicGrossCeilingInclusive: 21000,
  ptMonthlyDefault: 200,
  breakupPct: {
    basicPct: 0.5,
    hraPct: 0.2,
    medicalPct: 0.05,
    transPct: 0.05,
    ltaPct: 0.1,
    personalPct: 0.1,
  },
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

/** Normalize untrusted JSON from DB/API into a safe config. */
export function normalizePrivatePayrollConfig(raw: unknown): PrivatePayrollConfig {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bp = (r.breakupPct && typeof r.breakupPct === "object" ? (r.breakupPct as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const breakupPct: PrivatePayrollBreakupPct = {
    basicPct: pct(bp.basicPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.basicPct,
    hraPct: pct(bp.hraPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.hraPct,
    medicalPct: pct(bp.medicalPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.medicalPct,
    transPct: pct(bp.transPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.transPct,
    ltaPct: pct(bp.ltaPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.ltaPct,
    personalPct: pct(bp.personalPct) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.breakupPct.personalPct,
  };

  return {
    pfRate: clamp(n(r.pfRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfRate, 0, 1),
    pfWageCap: Math.max(0, n(r.pfWageCap) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfWageCap),
    pfCap: Math.max(0, n(r.pfCap) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.pfCap),
    esicEmployeeRate: clamp(n(r.esicEmployeeRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicEmployeeRate, 0, 1),
    esicEmployerRate: clamp(n(r.esicEmployerRate) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicEmployerRate, 0, 1),
    esicGrossCeilingInclusive: Math.max(
      0,
      n(r.esicGrossCeilingInclusive) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.esicGrossCeilingInclusive,
    ),
    ptMonthlyDefault: Math.max(0, n(r.ptMonthlyDefault) ?? DEFAULT_PRIVATE_PAYROLL_CONFIG.ptMonthlyDefault),
    breakupPct,
  };
}

