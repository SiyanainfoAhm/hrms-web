import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import type { RoleId } from "@/config/roleConfig";
import {
  BUILTIN_ROLE_KEYS,
  CUSTOM_ROLE_ACCESS_LEVELS,
  isBuiltInCompanyRole,
  mapRoleRow,
  permissionsForAccessLevel,
} from "@/lib/companyRoles";

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

function parseAccessLevel(body: Record<string, unknown>): RoleId | null {
  const raw = typeof body?.accessLevel === "string" ? body.accessLevel : typeof body?.roleKey === "string" ? body.roleKey : "";
  const level = raw.trim() as RoleId;
  if (!CUSTOM_ROLE_ACCESS_LEVELS.includes(level)) return null;
  return level;
}

async function getRoleForCompany(id: string, companyId: string) {
  const { data, error } = await supabase
    .from("HRMS_roles")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ roles: [] });

  const { data, error } = await supabase
    .from("HRMS_roles")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ roles: (data ?? []).map((row) => mapRoleRow(row as Record<string, unknown>)) });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const accessLevel = parseAccessLevel(body);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;

  if (!accessLevel) {
    return NextResponse.json({ error: "Select a valid access level (employee, manager, hr, or admin)" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Display name is required" }, { status: 400 });

  const permissions = permissionsForAccessLevel(accessLevel);

  const { data, error } = await supabase
    .from("HRMS_roles")
    .insert([
      {
        company_id: companyId,
        role_key: accessLevel,
        name,
        description,
        is_default: false,
        is_active: true,
        permissions,
      },
    ])
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ role: mapRoleRow(data as Record<string, unknown>) });
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
  if (!id) return NextResponse.json({ error: "Role id is required" }, { status: 400 });

  const current = await getRoleForCompany(id, companyId);
  if (!current) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (isBuiltInCompanyRole(current)) {
    return NextResponse.json({ error: "Built-in roles cannot be edited" }, { status: 400 });
  }

  const accessLevel = parseAccessLevel(body) ?? (String(current.role_key) as RoleId);
  if (!CUSTOM_ROLE_ACCESS_LEVELS.includes(accessLevel)) {
    return NextResponse.json({ error: "Invalid access level" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    role_key: accessLevel,
    permissions: permissionsForAccessLevel(accessLevel),
  };
  if (typeof body?.name === "string") payload.name = body.name.trim();
  if (typeof body?.description === "string") payload.description = body.description.trim() || null;

  const { data, error } = await supabase
    .from("HRMS_roles")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ role: mapRoleRow(data as Record<string, unknown>) });
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
  if (!id) return NextResponse.json({ error: "Role id is required" }, { status: 400 });

  const current = await getRoleForCompany(id, companyId);
  if (!current) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (isBuiltInCompanyRole(current)) {
    return NextResponse.json({ error: "Built-in roles cannot be changed" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("HRMS_roles")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ role: mapRoleRow(data as Record<string, unknown>) });
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
  if (!id) return NextResponse.json({ error: "Role id is required" }, { status: 400 });

  const current = await getRoleForCompany(id, companyId);
  if (!current) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (isBuiltInCompanyRole(current) || BUILTIN_ROLE_KEYS.has(String(current.role_key) as RoleId)) {
    return NextResponse.json({ error: "Built-in roles cannot be deleted" }, { status: 400 });
  }

  const { error } = await supabase.from("HRMS_roles").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
