import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { getRequestAppBaseUrl, sendInviteEmail } from "@/lib/inviteEmail";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

/** POST { userId } — send invite notification (Edge / Power Automate / Resend) for the latest pending invite. */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: invite, error: iErr } = await supabase
    .from("HRMS_employee_invites")
    .select("*")
    .eq("company_id", me.company_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  if (!invite) return NextResponse.json({ error: "No invite found for this employee" }, { status: 404 });
  if (invite.status !== "pending") {
    return NextResponse.json({ error: "No active pending invite. Use “Send documents again” to issue a new link." }, { status: 400 });
  }
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This invite has expired. Use “Send documents again” to issue a new link." }, { status: 400 });
  }

  const email = typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Invite has no email address" }, { status: 400 });

  const token = typeof invite.token === "string" ? invite.token : "";
  if (!token) return NextResponse.json({ error: "Invite token missing" }, { status: 400 });

  const { data: userRow } = await supabase.from("HRMS_users").select("name").eq("id", userId).maybeSingle();
  const { data: companyRow } = await supabase.from("HRMS_companies").select("name").eq("id", me.company_id).maybeSingle();

  const baseUrl = getRequestAppBaseUrl(request);
  const inviteUrl = `${baseUrl}/invite/${token}`;

  const sent = await sendInviteEmail({
    to: email,
    inviteUrl,
    recipientName: userRow?.name ?? null,
    companyName: companyRow?.name ?? null,
    userId,
    companyId: me.company_id,
  });

  if (!sent.ok) {
    return NextResponse.json({ error: sent.error, emailSent: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
