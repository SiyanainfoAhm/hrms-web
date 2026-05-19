"use client";

import { forwardRef } from "react";

export type PayrollRunExportRow = {
  employeeUserId: string;
  employeeName: string;
  payDays: number;
  unpaidLeaveDays?: number;
  grossPay: number;
  netPay: number;
  pfEmployee: number;
  pfEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  profTax: number;
  prBonus: number;
  incentive: number;
  reimbursement: number;
  tds: number;
  takeHome: number;
  ctc: number;
  deductions?: number;
};

type Props = {
  company: { name: string; address: string; logoUrl: string | null } | null;
  periodTitle: string;
  rows: PayrollRunExportRow[];
  pfColumnLabel?: string;
  governmentSummary?: boolean;
};

const th = "border border-black bg-slate-100 px-1.5 py-1.5 text-[10px] font-semibold text-slate-900";
const td = "border border-black px-1.5 py-1 text-[10px] text-slate-900";
const tdR = `${td} text-right tabular-nums`;
const tdL = `${td} text-left`;

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}

export const PayrollRunExportPrint = forwardRef<HTMLDivElement, Props>(function PayrollRunExportPrint(
  { company, periodTitle, rows, pfColumnLabel = "PF", governmentSummary = false },
  ref,
) {
  return (
    <div
      ref={ref}
      className="payroll-run-export-print bg-white text-black"
      style={{ width: "277mm", padding: "8mm", boxSizing: "border-box" }}
    >
      <table className="w-full border-collapse" style={{ border: "1px solid #000" }}>
        <tbody>
          <tr>
            <td colSpan={governmentSummary ? 8 : 14} className="border border-black px-4 py-4 text-center">
              {company?.logoUrl ? (
                <div className="mb-3 flex justify-center border-b border-black/20 pb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={company.logoUrl}
                    alt=""
                    style={{ height: 64, maxHeight: 72, width: "auto", maxWidth: 280, objectFit: "contain" }}
                  />
                </div>
              ) : null}
              <div style={{ fontSize: 14, fontWeight: 700 }}>{company?.name || "Company"}</div>
              {company?.address ? (
                <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>{company.address}</div>
              ) : null}
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10, letterSpacing: "0.05em" }}>
                PAYROLL REGISTER
              </div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{periodTitle}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-0 w-full border-collapse" style={{ border: "1px solid #000", borderTop: "none" }}>
        <thead>
          <tr>
            <th className={`${th} text-left`}>Employee</th>
            <th className={`${th} text-right`}>Days</th>
            {governmentSummary ? (
              <>
                <th className={`${th} text-right`}>Gross</th>
                <th className={`${th} text-right`}>Deductions</th>
                <th className={`${th} text-right`}>Net</th>
                <th className={`${th} text-right`}>Take home</th>
                <th className={`${th} text-right`}>Bonus</th>
                <th className={`${th} text-right`}>TDS</th>
              </>
            ) : (
              <>
                <th className={`${th} text-right`}>Gross</th>
                <th className={`${th} text-right`}>Net</th>
                <th className={`${th} text-right`}>{pfColumnLabel}</th>
                <th className={`${th} text-right`}>PF(R)</th>
                <th className={`${th} text-right`}>ESIC</th>
                <th className={`${th} text-right`}>ESIC(R)</th>
                <th className={`${th} text-right`}>PT</th>
                <th className={`${th} text-right`}>Bonus</th>
                <th className={`${th} text-right`}>Inc</th>
                <th className={`${th} text-right`}>Reimb</th>
                <th className={`${th} text-right`}>TDS</th>
                <th className={`${th} text-right`}>Take</th>
                <th className={`${th} text-right`}>CTC</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const daysLabel =
              r.unpaidLeaveDays && r.unpaidLeaveDays > 0 ? `${r.payDays} (-${r.unpaidLeaveDays})` : String(r.payDays);
            const gov = r as PayrollRunExportRow & { deductions?: number };
            return (
              <tr key={r.employeeUserId}>
                <td className={tdL}>{r.employeeName}</td>
                <td className={tdR}>{daysLabel}</td>
                {governmentSummary ? (
                  <>
                    <td className={tdR}>{fmt(r.grossPay)}</td>
                    <td className={tdR}>{fmt(gov.deductions ?? 0)}</td>
                    <td className={tdR}>{fmt(r.netPay)}</td>
                    <td className={tdR}>{fmt(r.takeHome)}</td>
                    <td className={tdR}>{fmt(r.prBonus)}</td>
                    <td className={tdR}>{fmt(r.tds)}</td>
                  </>
                ) : (
                  <>
                    <td className={tdR}>{fmt(r.grossPay)}</td>
                    <td className={tdR}>{fmt(r.netPay)}</td>
                    <td className={tdR}>{fmt(r.pfEmployee)}</td>
                    <td className={tdR}>{fmt(r.pfEmployer)}</td>
                    <td className={tdR}>{fmt(r.esicEmployee)}</td>
                    <td className={tdR}>{fmt(r.esicEmployer)}</td>
                    <td className={tdR}>{fmt(r.profTax)}</td>
                    <td className={tdR}>{fmt(r.prBonus)}</td>
                    <td className={tdR}>{fmt(r.incentive)}</td>
                    <td className={tdR}>{fmt(r.reimbursement)}</td>
                    <td className={tdR}>{fmt(r.tds)}</td>
                    <td className={tdR}>{fmt(r.takeHome)}</td>
                    <td className={tdR}>{fmt(r.ctc)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 9, color: "#64748b", marginTop: 8 }}>
        Generated {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {rows.length} employee
        {rows.length === 1 ? "" : "s"}
      </p>
    </div>
  );
});
