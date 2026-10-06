import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { normalizePrivatePayrollConfig } from "@/lib/payrollConfig";
import { applicablePrivatePayrollPolicy } from "@/lib/privatePayrollPolicy";

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ config: normalizePrivatePayrollConfig(null) });

  // If table doesn't exist yet, fall back to defaults.
  const { data, error } = await supabase
    .from("HRMS_company_payroll_config")
    .select("private_config")
    .eq("company_id", me.company_id)
    .maybeSingle();
  const { data: policies } = await supabase
    .from("HRMS_private_payroll_policy_versions")
    .select("effective_from, effective_to, private_config")
    .eq("company_id", me.company_id);
  const payrollMonth = new URL(request.url).searchParams.get("month") || new Date().toISOString().slice(0, 10);
  const config = applicablePrivatePayrollPolicy(payrollMonth, policies as any, (data as any)?.private_config);
  const policy = (policies ?? []).filter((p: any) => String(p.effective_from).slice(0, 10) <= payrollMonth).sort((a: any, b: any) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  return NextResponse.json({ config, effectiveFrom: policy?.effective_from ?? null });
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const incoming = body?.config;
  // Editing settings always creates the next/current monthly version unless an
  // explicit future effective date is supplied; it never overwrites a version.
  const effectiveFrom = typeof body?.effectiveFrom === "string"
    ? body.effectiveFrom.slice(0, 10)
    : `${new Date().toISOString().slice(0, 7)}-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || effectiveFrom < "2026-09-01") {
    return NextResponse.json({ error: "Private payroll policy changes must start on or after 2026-09-01." }, { status: 400 });
  }
  const normalized = normalizePrivatePayrollConfig(incoming);
  const sum =
    (normalized.breakupPct.basicPct || 0) +
    (normalized.breakupPct.hraPct || 0) +
    (normalized.breakupPct.medicalPct || 0) +
    (normalized.breakupPct.transPct || 0) +
    (normalized.breakupPct.ltaPct || 0) +
    (normalized.breakupPct.personalPct || 0);
  if (sum > 1.000001) {
    return NextResponse.json({ error: "Breakup percentage total must be 100% or less." }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "No company" }, { status: 400 });

  // A policy version is immutable once created. This prevents settings edits from
  // changing the formula of an already generated month.
  const { error } = await supabase.from("HRMS_private_payroll_policy_versions").insert([
    { company_id: me.company_id, effective_from: effectiveFrom, private_config: normalized as any, created_by: session.id },
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, config: normalized, effectiveFrom });
}

