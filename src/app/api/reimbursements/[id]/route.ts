import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { sendPowerAutomateEmail } from "@/lib/powerAutomateEmail";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAppUrl(): string {
  const u = (process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://hrms-web-rage.vercel.app/").trim();
  return u.replace(/\/$/, "");
}

function buildReimbDecisionHtml(args: {
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

function isApproverRole(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isApproverRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action === "reject" ? "reject" : "approve";
  const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: row, error: fetchErr } = await supabase
    .from("HRMS_reimbursements")
    .select("id, status, company_id, employee_user_id, category, amount, claim_date, description, attachment_url")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  if (!row || row.company_id !== me.company_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: "Only pending claims can be updated" }, { status: 400 });

  const now = new Date().toISOString();

  if (action === "approve") {
    const { error: upErr } = await supabase
      .from("HRMS_reimbursements")
      .update({
        status: "approved",
        approver_user_id: session.id,
        approved_at: now,
        rejected_at: null,
        rejection_reason: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("company_id", me.company_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  } else {
    const { error: upErr } = await supabase
      .from("HRMS_reimbursements")
      .update({
        status: "rejected",
        approver_user_id: session.id,
        rejected_at: now,
        rejection_reason: rejectionReason || null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("company_id", me.company_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  // Notify employee (best-effort).
  try {
    const empUid = String((row as any)?.employee_user_id ?? "");
    if (empUid) {
      const { data: emp } = await supabase.from("HRMS_users").select("name, email").eq("id", empUid).maybeSingle();
      const toEmail = (emp as any)?.email ? String((emp as any).email) : "";
      if (toEmail) {
        const employeeName = (emp as any)?.name ? String((emp as any).name) : null;
        const { data: company } = await supabase.from("HRMS_companies").select("name").eq("id", me.company_id).maybeSingle();
        const companyName = (company as any)?.name ? String((company as any).name) : null;
        const status = action === "approve" ? "approved" : "rejected";
        const amount = Number((row as any)?.amount ?? 0) || 0;
        const claimDate = String((row as any)?.claim_date ?? "");
        const category = String((row as any)?.category ?? "");
        const description = String((row as any)?.description ?? "");
        const attachmentUrl = (row as any)?.attachment_url ? String((row as any).attachment_url) : null;
        const rej = action === "reject" ? (rejectionReason || null) : null;

        const subject = `${companyName ? `${companyName} — ` : ""}Reimbursement ${status}: ₹${Math.round(amount).toLocaleString("en-IN")}`;
        const body = buildReimbDecisionHtml({
          title: `Your reimbursement has been ${status}`,
          companyName,
          employeeName,
          employeeEmail: toEmail,
          category,
          amount,
          claimDate,
          description,
          attachmentUrl,
          status,
          rejectionReason: rej,
        });
        await sendPowerAutomateEmail({ toEmail, subject, body });
      }
    }
  } catch (e) {
    console.warn("[reimb-email] decision notify failed", e);
  }

  return NextResponse.json({ ok: true });
}
