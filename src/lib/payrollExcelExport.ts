/** Excel column order (simplified): identity + key amounts (no government-only LIC/CPF/etc). */
export const PAYROLL_EXCEL_HEADER = [
  "EmployeeName",
  "AccountNumber",
  "BankName",
  "IFSC",
  "Gross",
  "PF",
  "PT",
  "TDS",
  "TakeHome",
] as const;

export type PayrollExcelHeader = (typeof PAYROLL_EXCEL_HEADER)[number];

type PayslipExcelInput = {
  employee_user_id: string;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  ctc?: number | null;
  gross_pay?: number | null;
  net_pay?: number | null;
  pay_days?: number | null;
  basic?: number | null;
  hra?: number | null;
  medical?: number | null;
  trans?: number | null;
  lta?: number | null;
  personal?: number | null;
  deductions?: number | null;
  pf_employee?: number | null;
  pf_employer?: number | null;
  esic_employee?: number | null;
  esic_employer?: number | null;
  professional_tax?: number | null;
  incentive?: number | null;
  pr_bonus?: number | null;
  reimbursement?: number | null;
  tds?: number | null;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * One payroll Excel row (simplified). TakeHome matches the final credit.
 */
export function buildPayrollExcelRow(
  p: PayslipExcelInput,
  userName: string,
): Record<PayrollExcelHeader, string | number> {
  const accountNum = p.bank_account_number != null ? String(p.bank_account_number) : "";
  const bankName = p.bank_name != null ? String(p.bank_name) : "";
  const ifsc = p.bank_ifsc != null ? String(p.bank_ifsc) : "";
  const gross = Math.round(n(p.gross_pay));
  const pf = Math.round(n(p.pf_employee));
  const pt = Math.round(n(p.professional_tax));
  const tds = Math.round(n(p.tds));
  // Take-home should match the final credited amount.
  const takeHome = Math.round(n(p.net_pay));
  return {
    EmployeeName: userName,
    AccountNumber: accountNum,
    BankName: bankName,
    IFSC: ifsc,
    Gross: gross,
    PF: pf,
    PT: pt,
    TDS: tds,
    TakeHome: takeHome,
  };
}

/** 0-based column indices to center (all numeric / mode after name). */
export function payrollExcelAmountColumnIndices(): number[] {
  const skip = 4; // name + bank columns
  return Array.from({ length: PAYROLL_EXCEL_HEADER.length - skip }, (_, i) => i + skip);
}
