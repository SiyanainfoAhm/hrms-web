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

  // Pre-check to ensure our error message is accurate (even if DB still has old unique constraint).
  {
    let q = supabase
      .from("HRMS_departments")
      .select("id, division_id")
      .eq("company_id", companyId)
      .ilike("name", name);
    if (divisionId) q = q.eq("division_id", divisionId);
    else q = q.is("division_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) {
      return NextResponse.json({ error: "Department name already exists in this division." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("HRMS_departments")
    .insert([{ company_id: companyId, name, description: description || null, division_id: divisionId || null }])
    .select("*")
    .single();
  if (error) {
    const msg = String((error as any)?.message ?? "");
    const isDup =
      (error as any)?.code === "23505" ||
      msg.toLowerCase().includes("duplicate key value") ||
      msg.toLowerCase().includes("unique constraint");
    if (isDup) {
      // If it isn't a dup inside this division, it likely exists in another division (old DB constraint).
      const { data: other } = await supabase
        .from("HRMS_departments")
        .select("id, division_id")
        .eq("company_id", companyId)
        .ilike("name", name)
        .maybeSingle();
      if (other?.id) {
        return NextResponse.json(
          {
            error:
              "Department name already exists in another division. Apply the migration `2026-04-21_departments_unique_by_division.sql` to allow same names across divisions.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "Department name already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: msg || "Failed to add department" }, { status: 400 });
  }
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

  const nextName = typeof payload.name === "string" ? payload.name : null;
  const nextDivisionId =
    payload.division_id === undefined ? undefined : (payload.division_id as string | null);

  // Pre-check uniqueness inside the target division (exclude current row).
  if (nextName != null || nextDivisionId !== undefined) {
    const { data: current } = await supabase
      .from("HRMS_departments")
      .select("name, division_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();

    const finalName = (nextName ?? current?.name ?? "").trim();
    const finalDivision = nextDivisionId !== undefined ? nextDivisionId : (current?.division_id ?? null);

    if (finalName) {
      let q = supabase
        .from("HRMS_departments")
        .select("id")
        .eq("company_id", companyId)
        .neq("id", id)
        .ilike("name", finalName);
      if (finalDivision) q = q.eq("division_id", finalDivision);
      else q = q.is("division_id", null);
      const { data: dupe } = await q.maybeSingle();
      if (dupe?.id) {
        return NextResponse.json({ error: "Department name already exists in this division." }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from("HRMS_departments")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) {
    const msg = String((error as any)?.message ?? "");
    const isDup =
      (error as any)?.code === "23505" ||
      msg.toLowerCase().includes("duplicate key value") ||
      msg.toLowerCase().includes("unique constraint");
    if (isDup) {
      return NextResponse.json(
        {
          error:
            "Duplicate department name. If this name is in a different division, apply the migration `2026-04-21_departments_unique_by_division.sql`.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg || "Failed to update department" }, { status: 400 });
  }
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

