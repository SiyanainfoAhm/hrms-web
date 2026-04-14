import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

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
    .select("id, status, company_id")
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

  return NextResponse.json({ ok: true });
}
