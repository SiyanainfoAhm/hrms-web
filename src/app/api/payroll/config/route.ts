import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { normalizePrivatePayrollConfig } from "@/lib/payrollConfig";

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
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
  if (!me?.company_id) return NextResponse.json({ config: normalizePrivatePayrollConfig(null) });

  // If table doesn't exist yet, fall back to defaults.
  const { data, error } = await supabase
    .from("HRMS_company_payroll_config")
    .select("private_config")
    .eq("company_id", me.company_id)
    .maybeSingle();
  if (error) return NextResponse.json({ config: normalizePrivatePayrollConfig(null) });

  return NextResponse.json({ config: normalizePrivatePayrollConfig((data as any)?.private_config) });
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const incoming = body?.config;
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

  const { error } = await supabase.from("HRMS_company_payroll_config").upsert(
    [
      {
        company_id: me.company_id,
        private_config: normalized as any,
        updated_by: session.id,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "company_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, config: normalized });
}

