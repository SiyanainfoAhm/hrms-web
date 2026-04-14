import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: subs, error: sErr } = await supabase
    .from("HRMS_employee_document_submissions")
    .select(
      "id, document_id, status, file_url, signature_name, signed_at, submitted_at, review_note, updated_at, created_at"
    )
    .eq("user_id", session.id);

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  const list = subs ?? [];
  const docIds = [...new Set(list.map((x: { document_id: string }) => x.document_id).filter(Boolean))];

  const docMap: Record<string, { name: string; kind: string }> = {};
  if (docIds.length) {
    const { data: docs, error: dErr } = await supabase.from("HRMS_company_documents").select("id, name, kind").in("id", docIds);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
    for (const d of docs ?? []) {
      docMap[d.id as string] = { name: String(d.name ?? ""), kind: String(d.kind ?? "upload") };
    }
  }

  list.sort((a: { submitted_at?: string | null; signed_at?: string | null; updated_at?: string | null; created_at?: string | null }, b: typeof a) => {
    const ta = Date.parse(String(a.submitted_at || a.signed_at || a.updated_at || a.created_at || 0)) || 0;
    const tb = Date.parse(String(b.submitted_at || b.signed_at || b.updated_at || b.created_at || 0)) || 0;
    return tb - ta;
  });

  const items = list.map((s: Record<string, unknown>) => {
    const did = String(s.document_id ?? "");
    const d = docMap[did];
    return {
      submission_id: s.id,
      document_id: did,
      document_name: d?.name || "Document",
      kind: d?.kind || "upload",
      status: s.status,
      file_url: s.file_url,
      signature_name: s.signature_name,
      signed_at: s.signed_at,
      submitted_at: s.submitted_at,
      review_note: s.review_note,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  if (action !== "submit_document") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl.trim() : "";
  const signatureName = typeof body?.signatureName === "string" ? body.signatureName.trim() : "";

  if (!documentId) return NextResponse.json({ error: "documentId is required" }, { status: 400 });

  // Ensure the document exists and read kind (upload vs digital_signature)
  const { data: doc, error: docErr } = await supabase
    .from("HRMS_company_documents")
    .select("id, company_id, kind")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 400 });
  if (!doc) return NextResponse.json({ error: "Invalid document" }, { status: 400 });

  const nowIso = new Date().toISOString();
  if (String((doc as any).kind) === "upload") {
    if (!fileUrl) return NextResponse.json({ error: "fileUrl is required for upload documents" }, { status: 400 });
    const { data, error } = await supabase
      .from("HRMS_employee_document_submissions")
      .upsert(
        [
          {
            company_id: (doc as any).company_id,
            user_id: session.id,
            document_id: documentId,
            status: "submitted",
            file_url: fileUrl,
            signature_name: null,
            submitted_at: nowIso,
            updated_at: nowIso,
          },
        ],
        { onConflict: "user_id,document_id" }
      )
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ submission: data });
  }

  // digital signature
  if (!signatureName) return NextResponse.json({ error: "signatureName is required" }, { status: 400 });
  const { data, error } = await supabase
    .from("HRMS_employee_document_submissions")
    .upsert(
      [
        {
          company_id: (doc as any).company_id,
          user_id: session.id,
          document_id: documentId,
          status: "signed",
          file_url: fileUrl || null,
          signature_name: signatureName,
          signed_at: nowIso,
          submitted_at: nowIso,
          updated_at: nowIso,
        },
      ],
      { onConflict: "user_id,document_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ submission: data });
}
