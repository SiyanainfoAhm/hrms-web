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
  if (!me?.company_id) return NextResponse.json({ policies: [] });

  const { data, error } = await supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code)")
    .eq("company_id", me.company_id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ policies: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const leaveTypeId = typeof body?.leaveTypeId === "string" ? body.leaveTypeId : "";
  const accrualMethod = typeof body?.accrualMethod === "string" ? body.accrualMethod : "";
  const monthlyAccrualRate = body?.monthlyAccrualRate === null || body?.monthlyAccrualRate === undefined ? null : Number(body.monthlyAccrualRate);
  const annualQuota = body?.annualQuota === null || body?.annualQuota === undefined ? null : Number(body.annualQuota);
  const prorateOnJoin = body?.prorateOnJoin === undefined ? true : Boolean(body.prorateOnJoin);
  const resetMonth = body?.resetMonth === undefined ? 1 : Number(body.resetMonth);
  const resetDay = body?.resetDay === undefined ? 1 : Number(body.resetDay);
  const allowCarryover = body?.allowCarryover === undefined ? false : Boolean(body.allowCarryover);
  const carryoverLimit = body?.carryoverLimit === null || body?.carryoverLimit === undefined ? null : Number(body.carryoverLimit);

  if (!leaveTypeId) return NextResponse.json({ error: "leaveTypeId is required" }, { status: 400 });
  if (accrualMethod !== "monthly" && accrualMethod !== "annual" && accrualMethod !== "none") {
    return NextResponse.json({ error: "Invalid accrualMethod" }, { status: 400 });
  }
  if (accrualMethod === "monthly" && (monthlyAccrualRate == null || Number.isNaN(monthlyAccrualRate) || monthlyAccrualRate <= 0)) {
    return NextResponse.json({ error: "monthlyAccrualRate must be > 0 for monthly accrual" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  // Ensure leave type belongs to company
  const { data: lt, error: ltErr } = await supabase
    .from("HRMS_leave_types")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (ltErr) return NextResponse.json({ error: ltErr.message }, { status: 400 });
  if (!lt) return NextResponse.json({ error: "Invalid leaveTypeId" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_leave_policies")
    .upsert(
      [
        {
          company_id: me.company_id,
          leave_type_id: leaveTypeId,
          accrual_method: accrualMethod,
          monthly_accrual_rate: accrualMethod === "monthly" ? monthlyAccrualRate : null,
          annual_quota: accrualMethod === "none" ? null : annualQuota,
          prorate_on_join: Boolean(prorateOnJoin),
          reset_month: resetMonth,
          reset_day: resetDay,
          allow_carryover: Boolean(allowCarryover),
          carryover_limit: allowCarryover ? carryoverLimit : null,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "company_id,leave_type_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ policy: data });
}

