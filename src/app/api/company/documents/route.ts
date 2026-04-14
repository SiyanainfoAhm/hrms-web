import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ documents: [] });

  const { data, error } = await supabase
    .from("HRMS_company_documents")
    .select("*")
    .eq("company_id", me.company_id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const isMandatory = body?.isMandatory === undefined ? true : Boolean(body.isMandatory);
  const contentText = typeof body?.contentText === "string" ? body.contentText.trim() : undefined;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (kind !== "upload" && kind !== "digital_signature") return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_company_documents")
    .insert([
      {
        company_id: me.company_id,
        name,
        kind,
        is_mandatory: isMandatory,
        content_text: kind === "digital_signature" ? contentText || null : null,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ document: data });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const kind = typeof body?.kind === "string" ? body.kind : undefined;
  const isMandatory =
    body?.isMandatory === undefined ? undefined : Boolean(body.isMandatory);
  const contentText =
    typeof body?.contentText === "string" ? body.contentText.trim() : undefined;

  if (kind !== undefined && kind !== "upload" && kind !== "digital_signature") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (name !== undefined && !name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (name !== undefined) patch.name = name;
  if (kind !== undefined) patch.kind = kind;
  if (isMandatory !== undefined) patch.is_mandatory = isMandatory;
  if (contentText !== undefined) patch.content_text = contentText;
  if (kind === "upload") patch.content_text = null;

  const { data, error } = await supabase
    .from("HRMS_company_documents")
    .update(patch)
    .eq("company_id", me.company_id)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ document: data });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  // Note: if there are FK constraints from submissions, Supabase will return an error.
  const { error } = await supabase
    .from("HRMS_company_documents")
    .delete()
    .eq("company_id", me.company_id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

