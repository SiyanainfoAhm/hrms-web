import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { ensureEmployeeMirrorForUser } from "@/lib/ensureEmployeeMirror";
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

function buildReimbEmailHtml(args: {
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

const REIMB_SELECT =
  "id, company_id, employee_id, employee_user_id, department_id, category, amount, currency, claim_date, description, attachment_url, status, approver_id, approver_user_id, approved_at, rejected_at, paid_at, payroll_year, payroll_month, rejection_reason, included_in_payroll_period_id, created_at";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ claims: [], total: 0 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawSize = parseInt(searchParams.get("pageSize") || "0", 10);
  const paginated = rawSize > 0;
  const pageSize = Math.min(100, Math.max(1, rawSize));

  let q = supabase
    .from("HRMS_reimbursements")
    .select(REIMB_SELECT, paginated ? { count: "exact" } : {})
    .eq("company_id", me.company_id)
    .order("created_at", { ascending: false });

  if (!isApproverRole(session.role)) {
    q = q.eq("employee_user_id", session.id);
  }

  const { data: rows, error, count } = paginated
    ? await q.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1)
    : await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const userIds = new Set<string>();
  for (const r of rows ?? []) {
    if (r.employee_user_id) userIds.add(r.employee_user_id);
    if (r.approver_user_id) userIds.add(r.approver_user_id);
  }
  const names = new Map<string, { name: string | null; email: string | null }>();
  if (userIds.size) {
    const { data: users } = await supabase
      .from("HRMS_users")
      .select("id, name, email")
      .in("id", [...userIds]);
    for (const u of users ?? []) {
      names.set(u.id, { name: u.name, email: u.email });
    }
  }

  const claims = (rows ?? []).map((r: any) => ({
    ...r,
    employeeName: r.employee_user_id ? names.get(r.employee_user_id)?.name ?? null : null,
    employeeEmail: r.employee_user_id ? names.get(r.employee_user_id)?.email ?? null : null,
    approverName: r.approver_user_id ? names.get(r.approver_user_id)?.name ?? null : null,
    approverEmail: r.approver_user_id ? names.get(r.approver_user_id)?.email ?? null : null,
  }));

  if (paginated) {
    return NextResponse.json({ claims, total: count ?? 0, page, pageSize });
  }
  return NextResponse.json({ claims });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const amount = typeof body?.amount === "number" ? body.amount : parseFloat(String(body?.amount ?? ""));
  const claimDate = typeof body?.claimDate === "string" ? body.claimDate.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const attachmentUrl = typeof body?.attachmentUrl === "string" ? body.attachmentUrl.trim() : "";
  const employeeUserId = typeof body?.employeeUserId === "string" ? body.employeeUserId.trim() : "";

  if (!category) return NextResponse.json({ error: "Category is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  if (!claimDate) return NextResponse.json({ error: "Claim date is required" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (!attachmentUrl) return NextResponse.json({ error: "Attachment is required" }, { status: 400 });

  const targetUserId = isApproverRole(session.role) && employeeUserId ? employeeUserId : session.id;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(claimDate);
  if (!dateMatch) return NextResponse.json({ error: "Claim date must be YYYY-MM-DD" }, { status: 400 });
  const payrollYear = parseInt(dateMatch[1], 10);
  const payrollMonth = parseInt(dateMatch[2], 10);
  if (payrollYear < 2000 || payrollYear > 2100) return NextResponse.json({ error: "Invalid claim date" }, { status: 400 });
  if (payrollMonth < 1 || payrollMonth > 12) return NextResponse.json({ error: "Invalid claim date" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const mirror = await ensureEmployeeMirrorForUser(supabase, me.company_id, targetUserId);
  if (!mirror.ok) return NextResponse.json({ error: mirror.error }, { status: 400 });
  const empRow = mirror.row;

  const now = new Date().toISOString();
  /** Same idea as leave: when Admin / Super Admin / HR files for another employee, skip the pending queue. */
  const autoApprove = isApproverRole(session.role) && targetUserId !== session.id;

  const { data: inserted, error: insErr } = await supabase
    .from("HRMS_reimbursements")
    .insert([
      {
        company_id: me.company_id,
        employee_id: empRow.id,
        employee_user_id: targetUserId,
        department_id: empRow.department_id ?? null,
        category,
        amount: Math.round(amount * 100) / 100,
        currency: "INR",
        claim_date: claimDate,
        description,
        attachment_url: attachmentUrl,
        status: autoApprove ? "approved" : "pending",
        approver_user_id: autoApprove ? session.id : null,
        approved_at: autoApprove ? now : null,
        rejected_at: null,
        rejection_reason: null,
        payroll_year: payrollYear,
        payroll_month: payrollMonth,
        ...(autoApprove ? { updated_at: now } : {}),
      },
    ])
    .select("id")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // Email notifications (best-effort): HR on pending request; employee on auto-approve.
  try {
    const { data: companyRow } = await supabase.from("HRMS_companies").select("name").eq("id", me.company_id).maybeSingle();
    const companyName = (companyRow as any)?.name ? String((companyRow as any).name) : null;
    const { data: empUser } = await supabase.from("HRMS_users").select("name, email").eq("id", targetUserId).maybeSingle();
    const employeeName = (empUser as any)?.name ? String((empUser as any).name) : null;
    const employeeEmail = (empUser as any)?.email ? String((empUser as any).email) : null;
    const hrEmail = "hr@siyanainfo.com";

    if (autoApprove) {
      if (employeeEmail) {
        const subject = `${companyName ? `${companyName} — ` : ""}Reimbursement approved: ₹${Math.round(amount).toLocaleString("en-IN")}`;
        const body = buildReimbEmailHtml({
          title: "Your reimbursement has been approved",
          companyName,
          employeeName,
          employeeEmail,
          category,
          amount,
          claimDate,
          description,
          attachmentUrl,
          status: "approved",
        });
        await sendPowerAutomateEmail({ toEmail: employeeEmail, subject, body });
      }
    } else {
      const subject = `${companyName ? `${companyName} — ` : ""}Reimbursement request: ${employeeName || employeeEmail || "Employee"} (₹${Math.round(amount).toLocaleString("en-IN")})`;
      const body = buildReimbEmailHtml({
        title: "New reimbursement request",
        companyName,
        employeeName,
        employeeEmail,
        category,
        amount,
        claimDate,
        description,
        attachmentUrl,
        status: "pending",
      });
      await sendPowerAutomateEmail({ toEmail: hrEmail, subject, body });
    }
  } catch (e) {
    console.warn("[reimb-email] notify failed", e);
  }

  return NextResponse.json({ ok: true, id: inserted.id, status: autoApprove ? "approved" : "pending" });
}
