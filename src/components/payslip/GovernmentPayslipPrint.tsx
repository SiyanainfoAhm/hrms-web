"use client";

import { forwardRef } from "react";
import {
  governmentPayslipPeriodTitle,
  governmentPayslipTAccountRows,
  type GovernmentMonthlySlip,
} from "@/lib/governmentPayslipLayout";
import type { GovernmentLeavePayslipDisplay } from "@/lib/leaveBalancesCompute";

export type GovernmentPayslipPrintCompany = {
  name?: string | null;
  address?: string | null;
  logoUrl?: string | null;
};

export type GovernmentPayslipPrintUser = {
  name?: string | null;
  employeeCode?: string | null;
  designation?: string | null;
  departmentName?: string | null;
  dateOfJoining?: string | null;
  uanNumber?: string | null;
  pfNumber?: string | null;
};

export type GovernmentPayslipPrintSlip = {
  generatedAt: string;
  periodStart: string;
  payDays: number;
  unpaidLeaves: number;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  netPay?: number | null;
};

export type GovernmentPayslipPrintProps = {
  company: GovernmentPayslipPrintCompany | null;
  user: GovernmentPayslipPrintUser | null;
  slip: GovernmentPayslipPrintSlip;
  gov: GovernmentMonthlySlip;
  /** Leave lines for government slip; labels are fixed (Casual / Earned / HPL / HL + total). */
  leavePayslip?: GovernmentLeavePayslipDisplay | null;
};

function fmtDmy(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSalaryDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export const GovernmentPayslipPrint = forwardRef<HTMLDivElement, GovernmentPayslipPrintProps>(
  function GovernmentPayslipPrint({ company, user, slip, gov, leavePayslip }, ref) {
    const n = (x: number) => (Number(x) || 0).toLocaleString("en-IN");
    const cellClass = "border border-black px-2 py-1.5 align-top text-sm";
    const thClass = "border border-black px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide";

    const title = governmentPayslipPeriodTitle(slip.periodStart);
    const grossBasic = Number(gov.basic_actual ?? gov.basic_paid ?? 0) || 0;
    const dim = Number(gov.days_in_month ?? 0) || 0;
    const paidDays = Number(gov.paid_days ?? slip.payDays ?? 0) || 0;
    const netRounded = Math.round(Number(slip.netPay ?? gov.net_salary ?? 0));

    return (
      <div
        ref={ref}
        className="payslip-print-area overflow-x-auto rounded-lg border border-black bg-white p-5 print:overflow-visible print:max-w-[190mm]"
        style={{ minWidth: "min(100%, 190mm)" }}
      >
        <table className="w-full border-collapse" style={{ border: "1px solid #000" }}>
          <tbody>
            <tr>
              <td colSpan={2} className="border border-black px-3 py-3 text-center">
                {company?.logoUrl ? (
                  <div className="mb-2 flex justify-center border-b border-black/20 pb-2 print:mb-1 print:pb-1">
                    <img
                      src={company.logoUrl}
                      alt=""
                      className="h-14 max-h-[64px] w-auto max-w-[min(100%,260px)] object-contain"
                    />
                  </div>
                ) : null}
                {company?.address ? (
                  <div className="text-xs uppercase leading-snug text-slate-700">{company.address}</div>
                ) : null}
                <div className="mt-2 text-sm font-bold tracking-wide text-slate-900">{company?.name || "—"}</div>
                <div className="mt-2 text-base font-bold uppercase tracking-wide text-slate-900">{title}</div>
              </td>
            </tr>
            <tr>
              <td className={`w-1/2 ${cellClass}`}>
                <div className="space-y-1 text-sm leading-relaxed">
                  <div>
                    <span className="text-slate-600">Employee ID:</span> {user?.employeeCode || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Employee Name:</span> {user?.name || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Designation:</span> {user?.designation || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Department:</span> {user?.departmentName || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Date of Joining:</span>{" "}
                    {user?.dateOfJoining ? fmtDmy(String(user.dateOfJoining)) : "—"}
                  </div>
                </div>
              </td>
              <td className={`w-1/2 ${cellClass}`}>
                <div className="space-y-1 text-sm leading-relaxed">
                  <div>
                    <span className="text-slate-600">UAN:</span> {user?.uanNumber || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">CPF No:</span> {user?.pfNumber || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Bank:</span> {slip.bankName || "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Account No:</span> {slip.bankAccountNumber || "—"}
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td className={`${cellClass} p-0 align-top`}>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border-b border-black px-2 py-1.5 font-semibold text-slate-900">Gross Basic</td>
                      <td className="border-b border-l border-black px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">
                        {n(grossBasic)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="space-y-1 px-2 py-1.5 text-sm">
                  <div>
                    <span className="text-slate-600">Salary date:</span> {fmtSalaryDate(slip.generatedAt)}
                  </div>
                  <div>
                    <span className="text-slate-600">Total working days:</span> {dim > 0 ? dim : "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Paid days:</span> {paidDays}
                  </div>
                  <div>
                    <span className="text-slate-600">Unpaid leave days:</span> {slip.unpaidLeaves ?? 0}
                  </div>
                </div>
              </td>
              <td className={cellClass}>
                <div className="space-y-1 text-sm text-slate-700">
                  <div>
                    <span className="text-slate-600">Leave balance:</span>{" "}
                    {leavePayslip?.leaveBalanceTotal ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Casual leave:</span> {leavePayslip?.casualLeave ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">Earned leave:</span> {leavePayslip?.earnedLeave ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">HPL:</span> {leavePayslip?.hpl ?? "—"}
                  </div>
                  <div>
                    <span className="text-slate-600">HL:</span> {leavePayslip?.hl ?? "—"}
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-black p-0">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className={`${thClass} w-[38%]`}>Earnings</th>
                      <th className="border border-black px-2 py-1.5 text-right text-xs font-semibold">Amount</th>
                      <th className={`${thClass} w-[38%]`}>Deductions</th>
                      <th className="border border-black px-2 py-1.5 text-right text-xs font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {governmentPayslipTAccountRows(gov).map((row, i) => (
                      <tr key={i}>
                        <td className={cellClass}>{row.earningLabel}</td>
                        <td className={`${cellClass} text-right tabular-nums`}>
                          {row.earningLabel ? n(Number(row.earningPaid ?? 0)) : ""}
                        </td>
                        <td className={cellClass}>{row.deductionLabel}</td>
                        <td className={`${cellClass} text-right tabular-nums`}>
                          {row.deductionLabel ? n(Number(row.deductionAmount ?? 0)) : ""}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${cellClass} font-semibold`}>TOTAL EARNINGS</td>
                      <td className={`${cellClass} text-right font-semibold tabular-nums`}>
                        {n(Number(gov.total_earnings ?? 0))}
                      </td>
                      <td className={`${cellClass} font-semibold`}>TOTAL DEDUCTIONS</td>
                      <td className={`${cellClass} text-right font-semibold tabular-nums`}>
                        {n(Number(gov.total_deductions ?? 0))}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cellClass} font-bold`} colSpan={3}>
                        NET SALARY
                      </td>
                      <td className={`${cellClass} text-right font-bold tabular-nums`}>{n(netRounded)}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
);
