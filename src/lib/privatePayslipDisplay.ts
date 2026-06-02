import type { PrivatePayrollConfig } from "@/lib/payrollConfig";

export type PrivatePayslipEarningsRow = readonly [label: string, amount: number | null | undefined];

export type PrivatePayslipSlipAmounts = {
  basic?: number | null;
  hra?: number | null;
  medical?: number | null;
  trans?: number | null;
  lta?: number | null;
  personal?: number | null;
};

/** Earnings table rows for private payslip (classic vs Basic+DA / Advance / Special). */
export function privatePayslipEarningsRows(
  slip: PrivatePayslipSlipAmounts,
  cfg: Pick<PrivatePayrollConfig, "payslipEarningsMode" | "payslipEarningsEffectiveFromYm"> | null | undefined,
  periodMonth: string,
): PrivatePayslipEarningsRow[] {
  const effYm = cfg?.payslipEarningsEffectiveFromYm ?? "";
  const mode = cfg?.payslipEarningsMode ?? "classic";
  const useCompactHeads =
    mode === "basic_hra_advance_special" &&
    /^\d{4}-\d{2}$/.test(effYm) &&
    periodMonth.length >= 7 &&
    periodMonth >= effYm;

  if (useCompactHeads) {
    return [
      ["Basic + DA", slip.basic],
      ["HRA", slip.hra],
      ["Advance bonus", slip.medical],
      ["Special allowance", slip.personal],
    ];
  }

  return [
    ["Basic", slip.basic],
    ["HRA", slip.hra],
    ["Medical", slip.medical],
    ["Trans", slip.trans],
    ["LTA", slip.lta],
    ["Personal", slip.personal],
  ];
}

export type PrivatePayslipSideColumns = {
  dedLabel: string;
  dedAmount: number | null | undefined;
  perfLabel: string;
  perfAmount: number | null | undefined;
  dedEmpty?: boolean;
  perfEmpty?: boolean;
};

/** Deduction / performance cells aligned with earnings row index (PT, PF, ESIC, TDS). */
export function privatePayslipSideColumnsForRow(
  rowIndex: number,
  amounts: {
    professionalTax?: number | null;
    pfEmployee?: number | null;
    esicEmployee?: number | null;
    tds?: number | null;
    prBonus?: number | null;
    incentive?: number | null;
    reimbursement?: number | null;
  },
): PrivatePayslipSideColumns | null {
  if (rowIndex === 0) {
    return {
      dedLabel: "Professional Tax",
      dedAmount: amounts.professionalTax,
      perfLabel: "Bonus",
      perfAmount: amounts.prBonus,
    };
  }
  if (rowIndex === 1) {
    return {
      dedLabel: "PF",
      dedAmount: amounts.pfEmployee,
      perfLabel: "Incentive",
      perfAmount: amounts.incentive,
    };
  }
  if (rowIndex === 2) {
    return {
      dedLabel: "ESIC",
      dedAmount: amounts.esicEmployee,
      perfLabel: "Reimbursement",
      perfAmount: amounts.reimbursement,
    };
  }
  if (rowIndex === 3) {
    return {
      dedLabel: "TDS",
      dedAmount: amounts.tds,
      perfLabel: "",
      perfAmount: 0,
      perfEmpty: true,
    };
  }
  return null;
}
