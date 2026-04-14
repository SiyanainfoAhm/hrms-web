"use client";

import type { ReactNode } from "react";

/** Monthly compute snapshot from `/api/payroll/run` preview (same shape as `computeGovernmentMonthlyPayroll` result). */
export type GovernmentPreviewMonthly = {
  basicPaid: number;
  spPayPaid: number;
  daPaid: number;
  transportPaid: number;
  hraPaid: number;
  medicalPaid: number;
  extraWorkAllowancePaid: number;
  nightAllowancePaid: number;
  uniformAllowancePaid: number;
  educationAllowancePaid: number;
  daArrearsPaid: number;
  transportArrearsPaid: number;
  encashmentPaid: number;
  encashmentDaPaid: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  deductions: {
    incomeTax: number;
    pt: number;
    lic: number;
    cpf: number;
    daCpf: number;
    vpf: number;
    pfLoan: number;
    postOffice: number;
    creditSociety: number;
    stdLicenceFee: number;
    electricity: number;
    water: number;
    mess: number;
    horticulture: number;
    welfare: number;
    vehCharge: number;
    other: number;
  };
};

const GOV_PREVIEW_EARNING_FIELDS: { key: keyof GovernmentPreviewMonthly; label: string }[] = [
  { key: "basicPaid", label: "Basic" },
  { key: "spPayPaid", label: "SP" },
  { key: "daPaid", label: "DA" },
  { key: "transportPaid", label: "Transport" },
  { key: "hraPaid", label: "HRA" },
  { key: "medicalPaid", label: "Medical" },
  { key: "extraWorkAllowancePaid", label: "EWA" },
  { key: "nightAllowancePaid", label: "Night" },
  { key: "uniformAllowancePaid", label: "Uniform" },
  { key: "educationAllowancePaid", label: "Education" },
  { key: "daArrearsPaid", label: "DA arr." },
  { key: "transportArrearsPaid", label: "Tr. arr." },
  { key: "encashmentPaid", label: "Encash." },
  { key: "encashmentDaPaid", label: "Enc. DA" },
];

const GOV_PREVIEW_DEDUCTION_FIELDS: { key: keyof GovernmentPreviewMonthly["deductions"]; label: string }[] = [
  { key: "incomeTax", label: "Inc. tax" },
  { key: "pt", label: "P. Tax" },
  { key: "lic", label: "LIC" },
  { key: "cpf", label: "CPF" },
  { key: "daCpf", label: "DA CPF" },
  { key: "vpf", label: "VPF" },
  { key: "pfLoan", label: "PF loan" },
  { key: "postOffice", label: "Post off." },
  { key: "creditSociety", label: "Cr. society" },
  { key: "stdLicenceFee", label: "Std licence" },
  { key: "electricity", label: "Electricity" },
  { key: "water", label: "Water" },
  { key: "mess", label: "Mess" },
  { key: "horticulture", label: "Horticulture" },
  { key: "welfare", label: "Welfare" },
  { key: "vehCharge", label: "Veh. chg." },
  { key: "other", label: "Other" },
];

export type GovernmentRunPreviewRow = {
  employeeUserId: string;
  employeeName: string | null;
  employeeEmail: string;
  payDays: number;
  unpaidLeaveDays: number;
  grossMonthly?: number;
  grossPay: number;
  netPay: number;
  deductions: number;
  takeHome: number;
  incentive: number;
  prBonus: number;
  reimbursement: number;
  tds: number;
  pfEmployee: number;
  governmentMonthly?: GovernmentPreviewMonthly | null;
};

type Props = {
  rows: GovernmentRunPreviewRow[];
  daysInMonth: number;
  effectiveRunDay: number;
  readOnly: boolean;
  onUpdate: (employeeUserId: string, field: string, value: number) => void;
};

function d(m: GovernmentPreviewMonthly | null | undefined, k: keyof GovernmentPreviewMonthly["deductions"]): number {
  return Math.round(Number(m?.deductions?.[k] ?? 0));
}

function v(m: GovernmentPreviewMonthly | null | undefined, k: keyof GovernmentPreviewMonthly): number {
  return Math.round(Number((m as Record<string, unknown>)?.[k as string] ?? 0));
}

const th = "border border-slate-300 bg-slate-100 px-2 py-2 text-left text-xs font-semibold text-slate-800";
const tdBase = "border border-slate-200 align-top text-slate-900";
const tdNum = `${tdBase} px-2 py-2 text-right text-sm tabular-nums`;
const tdL = `${tdBase} px-2 py-2 text-left text-sm`;
const inpWide =
  "w-[5.25rem] min-w-[4.75rem] max-w-[6rem] rounded-md border border-sky-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-400";

function FieldChip({
  label,
  readOnly,
  value,
  onChange,
}: {
  label: string;
  readOnly: boolean;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex w-max min-w-0 flex-col gap-0.5 whitespace-nowrap">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">{label}</span>
      {readOnly ? (
        <span className="rounded border border-transparent px-2 py-1.5 text-right text-sm tabular-nums">
          {value.toLocaleString("en-IN")}
        </span>
      ) : (
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className={inpWide}
        />
      )}
    </div>
  );
}

/** One horizontal row of fields — width grows with content (no inner scroll). */
function SingleRowBand({
  title,
  titleClassName,
  children,
}: {
  title: string;
  titleClassName: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${titleClassName}`}>{title}</p>
      <table className="w-max border-collapse rounded-md border border-slate-200/90 bg-white/90">
        <tbody>
          <tr>{children}</tr>
        </tbody>
      </table>
    </div>
  );
}

export function GovernmentRunPreviewTable({ rows, daysInMonth, effectiveRunDay, readOnly, onUpdate }: Props) {
  return (
    <div className="-mx-1 sm:mx-0">
      <p className="mb-3 text-xs leading-relaxed text-slate-600">
        Government payroll preview: for each employee, <strong>all earnings are one horizontal row</strong> and{" "}
        <strong>all deductions the row below</strong>. The table grows to full width so every field is visible; on
        narrow screens use the <strong>single horizontal scroll</strong> under the card for the whole table. Before
        generating payroll you can edit all amounts; after a run this view is read-only.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
        <table className="w-max min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className={`${th} w-[140px]`}>Employee</th>
              <th className={`${th} w-[88px]`}>Days</th>
              <th className={`${th} w-[100px]`}>Gr. basic</th>
              <th className={th}>Earnings row / Deductions row</th>
              <th className={`${th} w-[88px] text-right`}>Σ Earn</th>
              <th className={`${th} w-[88px] text-right`}>Σ Ded</th>
              <th className={`${th} w-[88px] text-right`}>Net</th>
              <th className={`${th} w-[88px] text-right`}>Adv.</th>
              <th className={`${th} w-[88px] text-right`}>Reimb.</th>
              <th className={`${th} w-[96px] text-right`}>Take</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = r.governmentMonthly;
              const gb = r.grossMonthly ?? 0;
              return (
                <tr key={r.employeeUserId} className="border-t border-slate-200 bg-white">
                  <td className={tdL} title={r.employeeEmail || undefined}>
                    <span className="font-medium text-slate-900">{r.employeeName || r.employeeEmail || "—"}</span>
                  </td>
                  <td className={tdL}>
                    {readOnly ? (
                      <span className="text-sm">
                        {r.payDays}
                        {r.unpaidLeaveDays > 0 ? ` (−${r.unpaidLeaveDays})` : ""}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={effectiveRunDay ?? daysInMonth}
                        value={r.payDays}
                        onChange={(e) => onUpdate(r.employeeUserId, "payDays", parseInt(e.target.value, 10) || 0)}
                        className={`${inpWide} w-[4.5rem] min-w-[4rem]`}
                      />
                    )}
                  </td>
                  <td className={tdNum}>{gb.toLocaleString("en-IN")}</td>
                  <td className={`${tdBase} bg-slate-50/40 px-3 py-3`}>
                    <div className="flex flex-col gap-4">
                      <SingleRowBand title="Earnings (paid month)" titleClassName="text-emerald-900">
                        {GOV_PREVIEW_EARNING_FIELDS.map(({ key, label }) => (
                          <td key={key} className="border-r border-slate-100 px-2 py-2 align-bottom last:border-r-0">
                            <FieldChip
                              label={label}
                              readOnly={readOnly}
                              value={v(g, key)}
                              onChange={(n) => onUpdate(r.employeeUserId, `govEarning_${key}`, n)}
                            />
                          </td>
                        ))}
                      </SingleRowBand>
                      <SingleRowBand title="Deductions" titleClassName="text-rose-900">
                        {GOV_PREVIEW_DEDUCTION_FIELDS.map(({ key, label }) => (
                          <td key={key} className="border-r border-slate-100 px-2 py-2 align-bottom last:border-r-0">
                            <FieldChip
                              label={label}
                              readOnly={readOnly}
                              value={d(g, key)}
                              onChange={(n) => onUpdate(r.employeeUserId, `govDeduction_${key}`, n)}
                            />
                          </td>
                        ))}
                      </SingleRowBand>
                    </div>
                  </td>
                  <td className={tdNum}>{v(g, "totalEarnings").toLocaleString("en-IN")}</td>
                  <td className={tdNum}>{v(g, "totalDeductions").toLocaleString("en-IN")}</td>
                  <td className={tdNum}>{r.netPay.toLocaleString("en-IN")}</td>
                  <td className={tdNum}>
                    {readOnly ? (
                      (r.incentive ?? 0).toLocaleString("en-IN")
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={r.incentive ?? 0}
                        onChange={(e) => onUpdate(r.employeeUserId, "incentive", parseInt(e.target.value, 10) || 0)}
                        className={inpWide}
                      />
                    )}
                  </td>
                  <td className={tdNum}>
                    {readOnly ? (
                      (r.reimbursement ?? 0).toLocaleString("en-IN")
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={r.reimbursement ?? 0}
                        onChange={(e) => onUpdate(r.employeeUserId, "reimbursement", parseInt(e.target.value, 10) || 0)}
                        className={inpWide}
                      />
                    )}
                  </td>
                  <td className={`${tdNum} font-semibold text-slate-900`}>{r.takeHome.toLocaleString("en-IN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        Paid days max {effectiveRunDay ?? daysInMonth} (month length {daysInMonth} days). Σ Ded includes all deduction
        fields; the payslip &quot;CPF&quot; bundle is CPF + DA CPF + VPF + PF loan.
      </p>
    </div>
  );
}
