import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildLeaveEmailHtml } from "@/lib/leaveEmail";
import { buildReimbDecisionHtml, buildReimbEmailHtml } from "@/lib/reimbursementEmail";
import { sendPowerAutomateEmail } from "@/lib/powerAutomateEmail";

function hrEmail(): string {
  return (process.env.HRMS_NOTIFY_HR_EMAIL || "hr@siyanainfo.com").trim();
}

/** Power Automate leave / reimbursement notifications (same templates as web API routes). */
export async function notifyLeaveRequestCreated(requestId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("HRMS_leave_requests")
    .select("*, HRMS_leave_types(name)")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !row) {
    console.warn("[hrmsTransactionNotify] leave create: row not found", requestId, error?.message);
    return;
  }

  const companyId = String((row as any).company_id ?? "");
  const employeeUserId = String((row as any).employee_user_id ?? "");
  const leaveTypeName = String((row as any).HRMS_leave_types?.name ?? "Leave");
  const startDate = String((row as any).start_date ?? "");
  const endDate = String((row as any).end_date ?? "");
  const totalDays = Number((row as any).total_days ?? 0) || 0;
  const paidDays = Number((row as any).paid_days ?? 0) || 0;
  const unpaidDays = Number((row as any).unpaid_days ?? 0) || 0;
  const reason = (row as any).reason ? String((row as any).reason) : null;
  const autoApprove = String((row as any).status ?? "") === "approved";

  const { data: empRow } = employeeUserId
    ? await supabaseAdmin.from("HRMS_users").select("name, email").eq("id", employeeUserId).maybeSingle()
    : { data: null };
  const employeeName = (empRow as any)?.name ? String((empRow as any).name) : null;
  const employeeEmail = (empRow as any)?.email ? String((empRow as any).email) : null;

  const { data: companyRow } = companyId
    ? await supabaseAdmin.from("HRMS_companies").select("name").eq("id", companyId).maybeSingle()
    : { data: null };
  const companyName = (companyRow as any)?.name ? String((companyRow as any).name) : null;

  if (autoApprove) {
    if (!employeeEmail) return;
    const subject = `${companyName ? `${companyName} — ` : ""}Leave approved: ${startDate} to ${endDate}`;
    const body = buildLeaveEmailHtml({
      title: "Your leave has been approved",
      companyName,
      employeeName,
      employeeEmail,
      leaveTypeName,
      startDate,
      endDate,
      totalDays,
      paidDays,
      unpaidDays,
      reason: reason || null,
      status: "approved",
    });
    const res = await sendPowerAutomateEmail({ toEmail: employeeEmail, subject, body });
    if (!res.ok) throw new Error(res.error);
  } else {
    const to = hrEmail();
    const subject = `${companyName ? `${companyName} — ` : ""}Leave request: ${employeeName || employeeEmail || "Employee"} (${startDate} to ${endDate})`;
    const body = buildLeaveEmailHtml({
      title: "New leave request",
      companyName,
      employeeName,
      employeeEmail,
      leaveTypeName,
      startDate,
      endDate,
      totalDays,
      paidDays,
      unpaidDays,
      reason: reason || null,
      status: "pending",
    });
    const res = await sendPowerAutomateEmail({ toEmail: to, subject, body });
    if (!res.ok) throw new Error(res.error);
  }
}

export async function notifyLeaveRequestDecided(requestId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("HRMS_leave_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !row) {
    console.warn("[hrmsTransactionNotify] leave decide: row not found", requestId, error?.message);
    return;
  }

  const companyId = String((row as any).company_id ?? "");
  const employeeUserId = String((row as any).employee_user_id ?? "");
  const leaveTypeId = String((row as any).leave_type_id ?? "");

  const { data: empRow } = employeeUserId
    ? await supabaseAdmin.from("HRMS_users").select("name, email").eq("id", employeeUserId).maybeSingle()
    : { data: null };
  const employeeEmail = (empRow as any)?.email ? String((empRow as any).email) : "";
  if (!employeeEmail) return;

  const employeeName = (empRow as any)?.name ? String((empRow as any).name) : null;
  const { data: companyRow } = companyId
    ? await supabaseAdmin.from("HRMS_companies").select("name").eq("id", companyId).maybeSingle()
    : { data: null };
  const companyName = (companyRow as any)?.name ? String((companyRow as any).name) : null;
  const { data: ltRow } = leaveTypeId
    ? await supabaseAdmin.from("HRMS_leave_types").select("name").eq("id", leaveTypeId).maybeSingle()
    : { data: null };
  const leaveTypeName = (ltRow as any)?.name ? String((ltRow as any).name) : "Leave";

  const startDate = String((row as any)?.start_date ?? "");
  const endDate = String((row as any)?.end_date ?? "");
  const totalDays = Number((row as any)?.total_days ?? 0) || 0;
  const paidDays = Number((row as any)?.paid_days ?? 0) || 0;
  const unpaidDays = Number((row as any)?.unpaid_days ?? 0) || 0;
  const status = String((row as any)?.status ?? "");
  const rejectionReason = (row as any)?.rejection_reason ? String((row as any).rejection_reason) : null;
  const reason = (row as any)?.reason ? String((row as any).reason) : null;

  const isApproved = status === "approved";
  const subject = `${companyName ? `${companyName} — ` : ""}Leave ${isApproved ? "approved" : "rejected"}: ${startDate} to ${endDate}`;
  const body = buildLeaveEmailHtml({
    title: isApproved ? "Your leave has been approved" : "Your leave has been rejected",
    companyName,
    employeeName,
    employeeEmail,
    leaveTypeName,
    startDate,
    endDate,
    totalDays,
    paidDays,
    unpaidDays,
    reason,
    status,
    rejectionReason,
  });

  const res = await sendPowerAutomateEmail({ toEmail: employeeEmail, subject, body });
  if (!res.ok) throw new Error(res.error);
}

export async function notifyReimbursementCreated(reimbursementId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("HRMS_reimbursements")
    .select("*")
    .eq("id", reimbursementId)
    .maybeSingle();
  if (error || !row) {
    console.warn("[hrmsTransactionNotify] reimb create: row not found", reimbursementId, error?.message);
    return;
  }

  const companyId = String((row as any).company_id ?? "");
  const targetUserId = String((row as any).employee_user_id ?? "");
  const amount = Number((row as any)?.amount ?? 0) || 0;
  const claimDate = String((row as any)?.claim_date ?? "");
  const category = String((row as any)?.category ?? "");
  const description = String((row as any)?.description ?? "");
  const attachmentUrl = (row as any)?.attachment_url ? String((row as any).attachment_url) : null;
  const autoApprove = String((row as any).status ?? "") === "approved";

  const { data: companyRow } = companyId
    ? await supabaseAdmin.from("HRMS_companies").select("name").eq("id", companyId).maybeSingle()
    : { data: null };
  const companyName = (companyRow as any)?.name ? String((companyRow as any).name) : null;

  const { data: empUser } = targetUserId
    ? await supabaseAdmin.from("HRMS_users").select("name, email").eq("id", targetUserId).maybeSingle()
    : { data: null };
  const employeeName = (empUser as any)?.name ? String((empUser as any).name) : null;
  const employeeEmail = (empUser as any)?.email ? String((empUser as any).email) : null;

  if (autoApprove) {
    if (!employeeEmail) return;
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
  } else {
    const to = hrEmail();
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
    await sendPowerAutomateEmail({ toEmail: to, subject, body });
  }
}

/** Employee email for approve/reject only (not for "paid"). */
export async function notifyReimbursementDecided(reimbursementId: string): Promise<void> {
  const { data: row, error } = await supabaseAdmin
    .from("HRMS_reimbursements")
    .select("*")
    .eq("id", reimbursementId)
    .maybeSingle();
  if (error || !row) {
    console.warn("[hrmsTransactionNotify] reimb decide: row not found", reimbursementId, error?.message);
    return;
  }

  const status = String((row as any)?.status ?? "");
  if (status !== "approved" && status !== "rejected") return;

  const companyId = String((row as any).company_id ?? "");
  const empUid = String((row as any)?.employee_user_id ?? "");
  if (!empUid) return;

  const { data: emp } = await supabaseAdmin.from("HRMS_users").select("name, email").eq("id", empUid).maybeSingle();
  const toEmail = (emp as any)?.email ? String((emp as any).email) : "";
  if (!toEmail) return;

  const employeeName = (emp as any)?.name ? String((emp as any).name) : null;
  const { data: company } = companyId
    ? await supabaseAdmin.from("HRMS_companies").select("name").eq("id", companyId).maybeSingle()
    : { data: null };
  const companyName = (company as any)?.name ? String((company as any).name) : null;

  const amount = Number((row as any)?.amount ?? 0) || 0;
  const claimDate = String((row as any)?.claim_date ?? "");
  const category = String((row as any)?.category ?? "");
  const description = String((row as any)?.description ?? "");
  const attachmentUrl = (row as any)?.attachment_url ? String((row as any).attachment_url) : null;
  const rejectionReason =
    status === "rejected" ? (String((row as any)?.rejection_reason ?? "").trim() || null) : null;

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
    rejectionReason,
  });
  await sendPowerAutomateEmail({ toEmail, subject, body });
}
