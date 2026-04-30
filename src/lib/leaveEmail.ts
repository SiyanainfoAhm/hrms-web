function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Keep this file focused on leave-specific HTML body building.

function getAppUrl(): string {
  const u = (process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://hrms-web-rage.vercel.app/").trim();
  return u.replace(/\/$/, "");
}

export function buildLeaveEmailHtml(args: {
  title: string;
  companyName?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  leaveTypeName?: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  paidDays?: number;
  unpaidDays?: number;
  reason?: string | null;
  status?: string | null;
  rejectionReason?: string | null;
}): string {
  const org = args.companyName?.trim() ? `<strong>${escapeHtml(args.companyName.trim())}</strong>` : "HRMS";
  const empName = args.employeeName?.trim() ? escapeHtml(args.employeeName.trim()) : "Employee";
  const empEmail = args.employeeEmail?.trim() ? escapeHtml(args.employeeEmail.trim()) : "";
  const lt = args.leaveTypeName?.trim() ? escapeHtml(args.leaveTypeName.trim()) : "Leave";
  const reason = args.reason?.trim() ? escapeHtml(args.reason.trim()) : "—";
  const status = args.status?.trim() ? escapeHtml(args.status.trim()) : "";
  const rej = args.rejectionReason?.trim() ? escapeHtml(args.rejectionReason.trim()) : "";

  const paid = typeof args.paidDays === "number" ? args.paidDays : null;
  const unpaid = typeof args.unpaidDays === "number" ? args.unpaidDays : null;
  const appUrl = escapeHtml(getAppUrl());

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#0f172a;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 10px 40px rgba(15,23,42,0.06);">
        <tr><td style="padding:28px 24px 20px;">
          <div style="font-size:12px;color:#64748b;margin-bottom:10px;">${org}</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${escapeHtml(args.title)}</div>
          ${status ? `<div style="font-size:13px;color:#334155;margin-bottom:14px;">Status: <strong>${status}</strong></div>` : ""}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Employee</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${empName}${empEmail ? ` &lt;${empEmail}&gt;` : ""}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Leave type</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${lt}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Dates</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.startDate)} → ${escapeHtml(args.endDate)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Total days</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(String(args.totalDays))}</td>
            </tr>
            ${
              paid != null || unpaid != null
                ? `<tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Paid / Unpaid</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${paid != null ? escapeHtml(String(paid)) : "—"} / ${unpaid != null ? escapeHtml(String(unpaid)) : "—"}</td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Reason</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${reason}</td>
            </tr>
            ${rej ? `<tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Rejection reason</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${rej}</td>
            </tr>` : ""}
          </table>
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

// Sending is now handled by `sendPowerAutomateEmail` in `src/lib/powerAutomateEmail.ts`.

