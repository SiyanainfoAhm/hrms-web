import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

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
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: user, error: uErr } = await supabase
    .from("HRMS_users")
    .select("*")
    .eq("company_id", me.company_id)
    .eq("id", id)
    .maybeSingle();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
  if (!user) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data: invite, error: iErr } = await supabase
    .from("HRMS_employee_invites")
    .select("*")
    .eq("company_id", me.company_id)
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });

  let documents: any[] = [];
  let submissions: any[] = [];
  if (invite) {
    const requestedIds = Array.isArray(invite.requested_document_ids)
      ? (invite.requested_document_ids as any[]).filter((x) => typeof x === "string")
      : null;
    let docQuery = supabase
      .from("HRMS_company_documents")
      .select("*")
      .eq("company_id", me.company_id)
      .order("created_at", { ascending: true });
    if (requestedIds && requestedIds.length) docQuery = docQuery.in("id", requestedIds);
    const docsRes = await docQuery;
    if (docsRes.error) return NextResponse.json({ error: docsRes.error.message }, { status: 400 });
    documents = docsRes.data ?? [];

    // Submissions may be linked either to the invite (normal onboarding) OR directly to the user
    // (admin/hr uploads from the directory). Merge both so the Details dialog reflects reality.
    const subRes = await supabase
      .from("HRMS_employee_document_submissions")
      .select("*")
      .or(`invite_id.eq.${invite.id},and(user_id.eq.${id},company_id.eq.${me.company_id})`);
    if (subRes.error) return NextResponse.json({ error: subRes.error.message }, { status: 400 });
    const rawSubs = (subRes.data ?? []) as any[];
    const byDocId = new Map<string, any>();
    for (const s of rawSubs) {
      const did = String(s.document_id ?? "");
      if (!did) continue;
      // Prefer invite-scoped submission when both exist; otherwise keep the latest updated.
      const prev = byDocId.get(did);
      if (!prev) {
        byDocId.set(did, s);
        continue;
      }
      const prevInvite = String(prev.invite_id ?? "") === String(invite.id);
      const curInvite = String(s.invite_id ?? "") === String(invite.id);
      if (curInvite && !prevInvite) {
        byDocId.set(did, s);
        continue;
      }
      const ta = Date.parse(String(prev.updated_at || prev.submitted_at || prev.signed_at || prev.created_at || 0)) || 0;
      const tb = Date.parse(String(s.updated_at || s.submitted_at || s.signed_at || s.created_at || 0)) || 0;
      if (tb >= ta) byDocId.set(did, s);
    }
    submissions = [...byDocId.values()];
  }

  const { data: master } = await supabase
    .from("HRMS_payroll_master")
    .select("id, tds, advance_bonus, gross_salary, ctc, pf_eligible, esic_eligible, pt, effective_start_date")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", id)
    .is("effective_end_date", null)
    .order("effective_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ employee: user, invite, documents, submissions, payrollMaster: master ?? null });
}

