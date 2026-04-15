/** Excel column order aligned with Run Payroll grid (identity + pay days + amounts). */
export const PAYROLL_EXCEL_HEADER = [
  "EmployeeName",
  "AccountNumber",
  "BankName",
  "IFSC",
  "PayDays",
  "Gross",
  "Net",
  "PF",
  "PFEmployer",
  "ESIC",
  "ESICEmployer",
  "PT",
  "Bonus",
  "Incentive",
  "Reimbursement",
  "TDS",
  "Deductions",
  "TakeHome",
  "CTC",
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
 * One payroll Excel row. `net_pay` on payslips is stored as final take-home (after statutory deductions
 * and after TDS / incentive / bonus / reimbursement adjustments). `Net` is reconstructed for export to
 * match the Run Payroll preview (salary after deductions, before those variable lines).
 */
export function buildPayrollExcelRow(
  p: PayslipExcelInput,
  userName: string,
): Record<PayrollExcelHeader, string | number> {
  const accountNum = p.bank_account_number != null ? String(p.bank_account_number) : "";
  const bankName = p.bank_name != null ? String(p.bank_name) : "";
  const ifsc = p.bank_ifsc != null ? String(p.bank_ifsc) : "";
  const takeHome = Math.round(n(p.net_pay));
  const tds = Math.round(n(p.tds));
  const inc = Math.round(n(p.incentive));
  const bonus = Math.round(n(p.pr_bonus));
  const reimb = Math.round(n(p.reimbursement));
  const net = Math.round(takeHome + tds - inc - bonus - reimb);
  return {
    EmployeeName: userName,
    AccountNumber: accountNum,
    BankName: bankName,
    IFSC: ifsc,
    PayDays: Math.round(n(p.pay_days)),
    Gross: Math.round(n(p.gross_pay)),
    Net: net,
    PF: Math.round(n(p.pf_employee)),
    PFEmployer: Math.round(n(p.pf_employer)),
    ESIC: Math.round(n(p.esic_employee)),
    ESICEmployer: Math.round(n(p.esic_employer)),
    PT: Math.round(n(p.professional_tax)),
    Bonus: bonus,
    Incentive: inc,
    Reimbursement: reimb,
    TDS: tds,
    Deductions: Math.round(n(p.deductions)),
    TakeHome: takeHome,
    CTC: Math.round(n(p.ctc)),
  };
}

/** 0-based column indices to center (all numeric / mode after name). */
export function payrollExcelAmountColumnIndices(): number[] {
  const skip = 4; // name + bank columns
  return Array.from({ length: PAYROLL_EXCEL_HEADER.length - skip }, (_, i) => i + skip);
}
