import { getPublicAppUrl } from "@/lib/publicAppUrl";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getReimbursementEmailAppUrl(): string {
  return getPublicAppUrl();
}

export function buildReimbEmailHtml(args: {
  title: string;
  companyName?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  attachmentUrl?: string | null;
  status?: string | null;
  rejectionReason?: string | null;
}): string {
  const org = args.companyName?.trim() ? `<strong>${escapeHtml(args.companyName.trim())}</strong>` : "HRMS";
  const empName = args.employeeName?.trim() ? escapeHtml(args.employeeName.trim()) : "Employee";
  const empEmail = args.employeeEmail?.trim() ? escapeHtml(args.employeeEmail.trim()) : "";
  const status = args.status?.trim() ? escapeHtml(args.status.trim()) : "";
  const rej = args.rejectionReason?.trim() ? escapeHtml(args.rejectionReason.trim()) : "";
  const attachment = args.attachmentUrl?.trim() ? escapeHtml(args.attachmentUrl.trim()) : "";
  const money = Number.isFinite(args.amount) ? args.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(args.amount);
  const desc = args.description?.trim() ? escapeHtml(args.description.trim()) : "—";
  const appUrl = escapeHtml(getReimbursementEmailAppUrl());

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
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Category</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.category)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Amount</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">₹${escapeHtml(money)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Claim date</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.claimDate)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Description</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${desc}</td>
            </tr>
            ${attachment ? `<tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Attachment</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;"><a href="${attachment}" target="_blank" rel="noreferrer">Open</a></td>
            </tr>` : ""}
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

export function buildReimbDecisionHtml(args: {
  title: string;
  companyName?: string | null;
  employeeName?: string | null;
  employeeEmail?: string | null;
  category: string;
  amount: number;
  claimDate: string;
  description: string;
  attachmentUrl?: string | null;
  status: string;
  rejectionReason?: string | null;
}): string {
  const org = args.companyName?.trim() ? `<strong>${escapeHtml(args.companyName.trim())}</strong>` : "HRMS";
  const empName = args.employeeName?.trim() ? escapeHtml(args.employeeName.trim()) : "Employee";
  const empEmail = args.employeeEmail?.trim() ? escapeHtml(args.employeeEmail.trim()) : "";
  const status = escapeHtml(args.status);
  const rej = args.rejectionReason?.trim() ? escapeHtml(args.rejectionReason.trim()) : "";
  const attachment = args.attachmentUrl?.trim() ? escapeHtml(args.attachmentUrl.trim()) : "";
  const money = Number.isFinite(args.amount) ? args.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(args.amount);
  const desc = args.description?.trim() ? escapeHtml(args.description.trim()) : "—";
  const appUrl = escapeHtml(getReimbursementEmailAppUrl());

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#0f172a;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 10px 40px rgba(15,23,42,0.06);">
        <tr><td style="padding:28px 24px 20px;">
          <div style="font-size:12px;color:#64748b;margin-bottom:10px;">${org}</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${escapeHtml(args.title)}</div>
          <div style="font-size:13px;color:#334155;margin-bottom:14px;">Status: <strong>${status}</strong></div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Employee</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${empName}${empEmail ? ` &lt;${empEmail}&gt;` : ""}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Category</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.category)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Amount</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">₹${escapeHtml(money)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Claim date</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${escapeHtml(args.claimDate)}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Description</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;">${desc}</td>
            </tr>
            ${attachment ? `<tr>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;"><strong>Attachment</strong></td>
              <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;"><a href="${attachment}" target="_blank" rel="noreferrer">Open</a></td>
            </tr>` : ""}
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
