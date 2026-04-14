import {
  computeGovernmentMonthlyPayroll,
  deriveTransportSlabFromLevel,
  masterRowToDeductionDefaults,
} from "@/lib/governmentPayroll";

function pickNum(o: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const k of keys) {
    if (o[k] != null && Number.isFinite(Number(o[k]))) return Number(o[k]);
  }
  return fallback;
}

export type ResolvedConvertPayroll = {
  grossBasic: number;
  daPercent: number;
  hraPercent: number;
  medicalFixed: number;
  transportDaPercent: number;
  tdsMonthly: number;
  ptDefault: number;
  advanceBonus: number;
  dedRow: Record<string, unknown>;
  preview: ReturnType<typeof computeGovernmentMonthlyPayroll>;
  slab: ReturnType<typeof deriveTransportSlabFromLevel>;
};

/**
 * Merges optional client `payrollMaster` with employee/company defaults and returns
 * government payroll preview + slab (same logic as convert-to-current API).
 */
export function resolveConvertPayrollMasterInput(
  raw: unknown,
  base: {
    grossBasic: number;
    payLevel: number;
    ptMonthly: number;
    tdsMonthly: number;
  },
): ResolvedConvertPayroll {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const grossBasic = Math.max(0, Math.round(pickNum(o, ["gross_basic", "grossBasic"], base.grossBasic)));
  const daPercent = pickNum(o, ["da_percent", "daPercent"], 53);
  const hraPercent = pickNum(o, ["hra_percent", "hraPercent"], 30);
  const medicalFixed = Math.max(0, Math.round(pickNum(o, ["medical_fixed", "medicalFixed"], 3000)));
  const transportDaPercent = pickNum(o, ["transport_da_percent", "transportDaPercent"], 48.06);
  const tdsMonthly = Math.max(0, Math.round(pickNum(o, ["tds", "income_tax_default"], base.tdsMonthly)));
  const ptDefault = Math.max(0, Math.round(pickNum(o, ["pt_default", "pt"], base.ptMonthly)));
  const advanceBonus = Math.max(0, Math.round(pickNum(o, ["advance_bonus", "advanceBonus"], 0)));

  const dedRow: Record<string, unknown> = {
    income_tax_default: tdsMonthly,
    pt_default: ptDefault,
    lic_default: Math.max(0, Math.round(pickNum(o, ["lic_default", "licDefault"], 0))),
    cpf_default: Math.max(0, Math.round(pickNum(o, ["cpf_default", "cpfDefault"], 0))),
    da_cpf_default: Math.max(0, Math.round(pickNum(o, ["da_cpf_default", "daCpfDefault"], 0))),
    vpf_default: Math.max(0, Math.round(pickNum(o, ["vpf_default", "vpfDefault"], 0))),
    pf_loan_default: Math.max(0, Math.round(pickNum(o, ["pf_loan_default", "pfLoanDefault"], 0))),
    post_office_default: Math.max(0, Math.round(pickNum(o, ["post_office_default", "postOfficeDefault"], 0))),
    credit_society_default: Math.max(0, Math.round(pickNum(o, ["credit_society_default", "creditSocietyDefault"], 0))),
    std_licence_fee_default: Math.max(0, Math.round(pickNum(o, ["std_licence_fee_default", "stdLicenceFeeDefault"], 0))),
    electricity_default: Math.max(0, Math.round(pickNum(o, ["electricity_default", "electricityDefault"], 0))),
    water_default: Math.max(0, Math.round(pickNum(o, ["water_default", "waterDefault"], 0))),
    mess_default: Math.max(0, Math.round(pickNum(o, ["mess_default", "messDefault"], 0))),
    horticulture_default: Math.max(0, Math.round(pickNum(o, ["horticulture_default", "horticultureDefault"], 0))),
    welfare_default: Math.max(0, Math.round(pickNum(o, ["welfare_default", "welfareDefault"], 0))),
    veh_charge_default: Math.max(0, Math.round(pickNum(o, ["veh_charge_default", "vehChargeDefault"], 0))),
    other_deduction_default: Math.max(0, Math.round(pickNum(o, ["other_deduction_default", "otherDeductionDefault"], 0))),
  };

  const preview = computeGovernmentMonthlyPayroll({
    grossBasic,
    daPercent,
    hraPercent,
    medicalFixed,
    transportDaPercent,
    payLevel: base.payLevel,
    daysInMonth: 30,
    unpaidDays: 0,
    deductionDefaults: masterRowToDeductionDefaults(dedRow),
  });

  const slab = deriveTransportSlabFromLevel(base.payLevel);

  return {
    grossBasic,
    daPercent,
    hraPercent,
    medicalFixed,
    transportDaPercent,
    tdsMonthly,
    ptDefault,
    advanceBonus,
    dedRow,
    preview,
    slab,
  };
}

export function payrollMasterPayloadForClient(r: ResolvedConvertPayroll) {
  const d = r.dedRow;
  return {
    gross_basic: r.grossBasic,
    da_percent: r.daPercent,
    hra_percent: r.hraPercent,
    medical_fixed: r.medicalFixed,
    transport_da_percent: r.transportDaPercent,
    tds: r.tdsMonthly,
    pt_default: r.ptDefault,
    advance_bonus: r.advanceBonus,
    lic_default: Number(d.lic_default) || 0,
    cpf_default: Number(d.cpf_default) || 0,
    da_cpf_default: Number(d.da_cpf_default) || 0,
    vpf_default: Number(d.vpf_default) || 0,
    pf_loan_default: Number(d.pf_loan_default) || 0,
    post_office_default: Number(d.post_office_default) || 0,
    credit_society_default: Number(d.credit_society_default) || 0,
    std_licence_fee_default: Number(d.std_licence_fee_default) || 0,
    electricity_default: Number(d.electricity_default) || 0,
    water_default: Number(d.water_default) || 0,
    mess_default: Number(d.mess_default) || 0,
    horticulture_default: Number(d.horticulture_default) || 0,
    welfare_default: Number(d.welfare_default) || 0,
    veh_charge_default: Number(d.veh_charge_default) || 0,
    other_deduction_default: Number(d.other_deduction_default) || 0,
  };
}
