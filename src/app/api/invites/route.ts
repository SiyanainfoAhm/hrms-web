import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { getRequestAppBaseUrl, sendInviteEmail } from "@/lib/inviteEmail";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ invites: [] });

  const { data, error } = await supabase
    .from("HRMS_employee_invites")
    .select("*")
    .eq("company_id", me.company_id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const requestedDocumentIds = Array.isArray(body?.requestedDocumentIds)
    ? body.requestedDocumentIds.filter((x: any) => typeof x === "string")
    : null;
  const sendEmailRequested = Boolean(body?.sendEmail);
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  // Revoke any previous pending invites for this employee/email.
  await supabase
    .from("HRMS_employee_invites")
    .update({ status: "revoked" })
    .eq("company_id", me.company_id)
    .eq("email", email)
    .eq("status", "pending");

  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

  const { data, error } = await supabase
    .from("HRMS_employee_invites")
    .insert([
      {
        company_id: me.company_id,
        user_id: userId,
        email,
        token,
        requested_document_ids: requestedDocumentIds ? requestedDocumentIds : null,
        status: "pending",
        expires_at: expiresAt,
        created_by: session.id,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let emailSent = false;
  let emailError: string | undefined;
  if (sendEmailRequested && data?.token) {
    const baseUrl = getRequestAppBaseUrl(request);
    const inviteUrl = `${baseUrl}/invite/${data.token}`;
    const [{ data: companyRow }, { data: userRow }] = await Promise.all([
      supabase.from("HRMS_companies").select("name").eq("id", me.company_id).maybeSingle(),
      userId ? supabase.from("HRMS_users").select("name").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const mail = await sendInviteEmail({
      to: email,
      inviteUrl,
      recipientName: userRow?.name ?? null,
      companyName: companyRow?.name ?? null,
      userId: userId ?? undefined,
      companyId: me.company_id,
    });
    emailSent = mail.ok;
    if (!mail.ok) emailError = mail.error;
  }

  return NextResponse.json({ invite: data, emailSent, emailError });
}

