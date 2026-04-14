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
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ periods: [] });

  const { data, error } = await supabase
    .from("HRMS_payroll_periods")
    .select("id, period_name, period_start, period_end, is_locked, created_at")
    .eq("company_id", me.company_id)
    .order("period_start", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    periods: (data ?? []).map((p: any) => ({
      id: p.id,
      periodName: p.period_name,
      periodStart: String(p.period_start),
      periodEnd: String(p.period_end),
      isLocked: Boolean(p.is_locked),
      excelFilePath: null,
      createdAt: new Date(p.created_at).toISOString(),
    })),
  });
}
