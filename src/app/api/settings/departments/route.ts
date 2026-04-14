import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function canManage(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

async function getCompanyId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("HRMS_users").select("company_id").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data?.company_id ?? null) as string | null;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ departments: [] });

  const { data, error } = await supabase
    .from("HRMS_departments")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ departments: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : undefined;
  const divisionId = typeof body?.divisionId === "string" ? body.divisionId : undefined;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_departments")
    .insert([{ company_id: companyId, name, description: description || null, division_id: divisionId || null }])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ department: data });
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Department id is required" }, { status: 400 });

  const payload: Record<string, any> = {
    name: typeof body?.name === "string" ? body.name.trim() : undefined,
    description: typeof body?.description === "string" ? body.description.trim() || null : undefined,
    division_id: typeof body?.divisionId === "string" ? body.divisionId || null : undefined,
  };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const { data, error } = await supabase
    .from("HRMS_departments")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ department: data });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const isActive = Boolean(body?.isActive);
  if (!id) return NextResponse.json({ error: "Department id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_departments")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ department: data });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Department id is required" }, { status: 400 });

  const { error } = await supabase.from("HRMS_departments").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

