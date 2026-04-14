import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

async function getCompanyIdForSession(sessionUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", sessionUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.company_id as string | null) ?? null;
}

async function assertTargetUserInCompany(companyId: string, targetUserId: string) {
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("id, company_id, role, name, email")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false as const, status: 404 as const, message: "Employee not found" };
  if ((data as any).company_id !== companyId) return { ok: false as const, status: 403 as const, message: "Forbidden" };
  if ((data as any).role === "super_admin") return { ok: false as const, status: 403 as const, message: "Not allowed" };
  return { ok: true as const, user: data as any };
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let companyId: string | null = null;
  try {
    companyId = await getCompanyIdForSession(session.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load company" }, { status: 400 });
  }
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const chk = await assertTargetUserInCompany(companyId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: chk.status });

  const { data: docs, error: dErr } = await supabase
    .from("HRMS_company_documents")
    .select("id, name, kind, is_mandatory, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

  const { data: subs, error: sErr } = await supabase
    .from("HRMS_employee_document_submissions")
    .select("id, document_id, status, file_url, signature_name, signed_at, submitted_at, review_note, reviewed_at, reviewed_by, updated_at, created_at")
    .eq("company_id", companyId)
    .eq("user_id", id);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  return NextResponse.json({
    employee: { id: chk.user.id, name: chk.user.name ?? null, email: chk.user.email ?? "" },
    documents: docs ?? [],
    submissions: subs ?? [],
  });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "submit_document") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let companyId: string | null = null;
  try {
    companyId = await getCompanyIdForSession(session.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load company" }, { status: 400 });
  }
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const chk = await assertTargetUserInCompany(companyId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: chk.status });

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
  const signatureName = typeof body?.signatureName === "string" ? body.signatureName.trim() : "";
  const statusOverride = typeof body?.status === "string" ? String(body.status) : "";

  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

  const { data: doc, error: docErr } = await supabase
    .from("HRMS_company_documents")
    .select("id, company_id, kind")
    .eq("id", documentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 400 });
  if (!doc) return NextResponse.json({ error: "Invalid document" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const kind = String((doc as any).kind || "upload");
  const nextStatus =
    statusOverride ||
    (kind === "digital_signature" ? "signed" : "submitted");

  if (kind === "upload") {
    if (!fileUrl) return NextResponse.json({ error: "fileUrl is required for upload documents" }, { status: 400 });
  } else {
    if (!signatureName) return NextResponse.json({ error: "signatureName is required" }, { status: 400 });
  }

  const { data: upserted, error: upErr } = await supabase
    .from("HRMS_employee_document_submissions")
    .upsert(
      [
        {
          company_id: companyId,
          user_id: id,
          document_id: documentId,
          status: nextStatus,
          file_url: fileUrl || null,
          signature_name: signatureName || null,
          submitted_at: nowIso,
          signed_at: kind === "digital_signature" ? nowIso : null,
          updated_at: nowIso,
          reviewed_at: nextStatus === "approved" || nextStatus === "rejected" ? nowIso : null,
          reviewed_by: nextStatus === "approved" || nextStatus === "rejected" ? session.id : null,
        },
      ],
      { onConflict: "user_id,document_id" },
    )
    .select("*")
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ submission: upserted });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "update_submission") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let companyId: string | null = null;
  try {
    companyId = await getCompanyIdForSession(session.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load company" }, { status: 400 });
  }
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const chk = await assertTargetUserInCompany(companyId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: chk.status });

  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });

  const status = typeof body?.status === "string" ? body.status : null;
  const reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote.trim() : null;

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (status) {
    payload.status = status;
    if (status === "approved" || status === "rejected") {
      payload.reviewed_at = payload.updated_at;
      payload.reviewed_by = session.id;
    }
  }
  if (reviewNote != null) payload.review_note = reviewNote || null;

  const { error } = await supabase
    .from("HRMS_employee_document_submissions")
    .update(payload)
    .eq("company_id", companyId)
    .eq("user_id", id)
    .eq("id", submissionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const submissionId = (searchParams.get("submissionId") || "").trim();
  if (!submissionId) return NextResponse.json({ error: "submissionId is required" }, { status: 400 });

  let companyId: string | null = null;
  try {
    companyId = await getCompanyIdForSession(session.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load company" }, { status: 400 });
  }
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const chk = await assertTargetUserInCompany(companyId, id);
  if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: chk.status });

  const { error } = await supabase
    .from("HRMS_employee_document_submissions")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", id)
    .eq("id", submissionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

