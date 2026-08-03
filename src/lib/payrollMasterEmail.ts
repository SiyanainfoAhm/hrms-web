import { getPublicAppUrl } from "@/lib/publicAppUrl";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PayrollMasterChangeRow = {
  employeeName: string;
  field: string;
  previousValue: string;
  newValue: string;
};

export type PayrollMasterAffectedEmployee = {
  employeeName: string;
  employeeEmail?: string | null;
  updatedFields?: string[];
  newValuesSummary?: string;
};

export function formatPayrollMasterIstTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = (get("dayPeriod") || "AM").toUpperCase();
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod} IST`;
}

export function payrollMonthLabelFromYmd(ymd: string | null | undefined): string | null {
  const s = String(ymd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m] = s.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function buildPayrollMasterUpdatedEmailHtml(args: {
  companyName?: string | null;
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  updatedAtIst: string;
  payrollMonth?: string | null;
  affectedCount: number;
  affectedEmployees?: PayrollMasterAffectedEmployee[];
  changes?: PayrollMasterChangeRow[];
  hasExactDiff: boolean;
  hrmsUrl?: string | null;
}): string {
  const org = args.companyName?.trim()
    ? `<strong>${escapeHtml(args.companyName.trim())}</strong>`
    : "HRMS";
  const byName = args.updatedByName?.trim() ? escapeHtml(args.updatedByName.trim()) : "User";
  const byEmail = args.updatedByEmail?.trim() ? escapeHtml(args.updatedByEmail.trim()) : "";
  const month = args.payrollMonth?.trim() ? escapeHtml(args.payrollMonth.trim()) : "—";
  const appUrl = escapeHtml((args.hrmsUrl || getPublicAppUrl()).replace(/\/$/, ""));

  const changeRows =
    args.hasExactDiff && args.changes && args.changes.length > 0
      ? args.changes
          .map(
            (c) => `<tr>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;">${escapeHtml(c.employeeName)}</td>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;">${escapeHtml(c.field)}</td>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;text-align:right;">${escapeHtml(c.previousValue)}</td>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;text-align:right;">${escapeHtml(c.newValue)}</td>
            </tr>`,
          )
          .join("")
      : "";

  const summaryRows =
    !args.hasExactDiff && args.affectedEmployees && args.affectedEmployees.length > 0
      ? args.affectedEmployees
          .map((e) => {
            const name = escapeHtml(e.employeeName || "Employee");
            const email = e.employeeEmail?.trim() ? escapeHtml(e.employeeEmail.trim()) : "";
            const fields = e.updatedFields?.length
              ? escapeHtml(e.updatedFields.join(", "))
              : "Payroll master fields";
            const vals = e.newValuesSummary?.trim()
              ? escapeHtml(e.newValuesSummary.trim())
              : "—";
            return `<tr>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;">${name}${email ? ` &lt;${email}&gt;` : ""}</td>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;">${fields}</td>
              <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:13px;text-align:right;">${vals}</td>
            </tr>`;
          })
          .join("")
      : "";

  const changesBlock = args.hasExactDiff
    ? `<div style="margin-top:16px;font-size:14px;font-weight:700;">Changes</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px;">
        <tr>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><strong>Employee</strong></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><strong>Field</strong></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:right;"><strong>Previous</strong></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:right;"><strong>New</strong></td>
        </tr>
        ${changeRows || `<tr><td colspan="4" style="padding:10px 6px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">No field-level differences detected.</td></tr>`}
      </table>`
    : `<div style="margin-top:16px;font-size:14px;font-weight:700;">Updated employees</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px;">
        <tr>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><strong>Employee</strong></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><strong>Updated fields</strong></td>
          <td style="padding:8px 6px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:right;"><strong>New values</strong></td>
        </tr>
        ${summaryRows}
      </table>
      <div style="margin-top:10px;font-size:12px;color:#64748b;">Previous values were not available in this update context.</div>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#0f172a;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 10px 40px rgba(15,23,42,0.06);">
        <tr><td style="padding:28px 24px 20px;">
          <div style="font-size:12px;color:#64748b;margin-bottom:10px;">${org}</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Payroll Master Updated</div>
          <div style="font-size:13px;color:#334155;margin-bottom:14px;">Status: <strong>Updated</strong></div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Updated by</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${byName}${byEmail ? ` &lt;${byEmail}&gt;` : ""}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Updated at</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.updatedAtIst)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Payroll month / effective</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${month}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Employees affected</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${args.affectedCount}</td>
            </tr>
          </table>
          ${changesBlock}
          <div style="margin-top:20px;text-align:center;">
            <a href="${appUrl}" style="display:inline-block;background:#047857;color:#ffffff !important;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">Open HRMS Web</a>
          </div>
          <div style="margin-top:10px;font-size:12px;color:#64748b;text-align:center;">If the button doesn’t work, open: <span style="color:#0f766e;word-break:break-all;">${appUrl}</span></div>
          <div style="margin-top:18px;font-size:12px;color:#94a3b8;">This is an automated message from HRMS.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
