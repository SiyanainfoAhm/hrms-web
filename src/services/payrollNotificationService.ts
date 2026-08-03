import { sendPowerAutomateEmail, type SendEmailResult } from "@/lib/powerAutomateEmail";
import { getPublicAppUrl } from "@/lib/publicAppUrl";
import {
  buildPayrollMasterUpdatedEmailHtml,
  formatPayrollMasterIstTimestamp,
  type PayrollMasterAffectedEmployee,
  type PayrollMasterChangeRow,
} from "@/lib/payrollMasterEmail";

function hrEmail(): string {
  return (process.env.HRMS_NOTIFY_HR_EMAIL || "hr@siyanainfo.com").trim();
}

export type SendPayrollMasterUpdatedEmailArgs = {
  companyName?: string | null;
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  payrollMonth?: string | null;
  affectedEmployees: PayrollMasterAffectedEmployee[];
  changes?: PayrollMasterChangeRow[];
  hasExactDiff?: boolean;
  hrmsUrl?: string | null;
  updatedAt?: Date;
};

/**
 * Audit email to HR after Payroll Master save.
 * Uses the same flat Power Automate payload as leave/reimbursement:
 * `{ toEmail, subject, body }`.
 */
export async function sendPayrollMasterUpdatedEmail(
  args: SendPayrollMasterUpdatedEmailArgs,
): Promise<SendEmailResult> {
  const companyName = args.companyName?.trim() || "Siyana Info Solution Private Limited";
  const month = args.payrollMonth?.trim() || null;
  const subject = month
    ? `${companyName} — Payroll Master Updated: ${month}`
    : `${companyName} — Payroll Master Updated`;

  const body = buildPayrollMasterUpdatedEmailHtml({
    companyName,
    updatedByName: args.updatedByName,
    updatedByEmail: args.updatedByEmail,
    updatedAtIst: formatPayrollMasterIstTimestamp(args.updatedAt ?? new Date()),
    payrollMonth: month,
    affectedCount: args.affectedEmployees.length,
    affectedEmployees: args.affectedEmployees,
    changes: args.changes ?? [],
    hasExactDiff: args.hasExactDiff === true && (args.changes?.length ?? 0) > 0,
    hrmsUrl: args.hrmsUrl || getPublicAppUrl(),
  });

  return sendPowerAutomateEmail({
    toEmail: hrEmail(),
    subject,
    body,
  });
}
