import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { dayBeforeYmd, isValidYmd, ymdOnly } from "@/lib/leavePolicyEffective";
import { istTodayYmd } from "@/lib/istCalendar";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

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
  if (!me?.company_id) return NextResponse.json({ policies: [] });

  const leaveTypeId = request.nextUrl.searchParams.get("leaveTypeId");
  const history = request.nextUrl.searchParams.get("history") === "1";

  let query = supabase
    .from("HRMS_leave_policies")
    .select("*, HRMS_leave_types(id, name, is_paid, code)")
    .eq("company_id", me.company_id)
    .order("effective_from", { ascending: false });
  if (leaveTypeId) query = query.eq("leave_type_id", leaveTypeId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const today = istTodayYmd();
  const rows = data ?? [];

  // Default: return current versions only (one per type). history=1 returns all versions.
  if (!history && !leaveTypeId) {
    const byType = new Map<string, (typeof rows)[number]>();
    for (const p of rows) {
      const from = ymdOnly((p as any).effective_from) || "2000-01-01";
      const to = (p as any).effective_to != null ? ymdOnly((p as any).effective_to) : null;
      const applies = from <= today && (to == null || to >= today);
      if (!applies) continue;
      const prev = byType.get((p as any).leave_type_id);
      if (!prev || from >= ymdOnly((prev as any).effective_from)) {
        byType.set((p as any).leave_type_id, p);
      }
    }
    return NextResponse.json({ policies: [...byType.values()] });
  }

  return NextResponse.json({ policies: rows });
}

/**
 * Create a new effective-dated policy version for a leave type.
 * Closes any overlapping open/future versions for this company+type.
 * Does NOT mutate historical quota values on prior versions.
 */
export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const leaveTypeId = typeof body?.leaveTypeId === "string" ? body.leaveTypeId : "";
  const accrualMethod = typeof body?.accrualMethod === "string" ? body.accrualMethod : "";
  const monthlyAccrualRate =
    body?.monthlyAccrualRate === null || body?.monthlyAccrualRate === undefined
      ? null
      : Number(body.monthlyAccrualRate);
  const annualQuota =
    body?.annualQuota === null || body?.annualQuota === undefined ? null : Number(body.annualQuota);
  const prorateOnJoin = body?.prorateOnJoin === undefined ? true : Boolean(body.prorateOnJoin);
  const resetMonth = body?.resetMonth === undefined ? 1 : Number(body.resetMonth);
  const resetDay = body?.resetDay === undefined ? 1 : Number(body.resetDay);
  const allowCarryover = body?.allowCarryover === undefined ? false : Boolean(body.allowCarryover);
  const carryoverLimit =
    body?.carryoverLimit === null || body?.carryoverLimit === undefined
      ? null
      : Number(body.carryoverLimit);
  const requestEnabled = body?.requestEnabled === undefined ? true : Boolean(body.requestEnabled);
  const effectiveFromRaw =
    typeof body?.effectiveFrom === "string" ? ymdOnly(body.effectiveFrom) : istTodayYmd();
  const effectiveToRaw =
    body?.effectiveTo === null || body?.effectiveTo === undefined || body?.effectiveTo === ""
      ? null
      : ymdOnly(String(body.effectiveTo));

  if (!leaveTypeId) return NextResponse.json({ error: "leaveTypeId is required" }, { status: 400 });
  if (accrualMethod !== "monthly" && accrualMethod !== "annual" && accrualMethod !== "none") {
    return NextResponse.json({ error: "Invalid accrualMethod" }, { status: 400 });
  }
  if (
    accrualMethod === "monthly" &&
    (monthlyAccrualRate == null || Number.isNaN(monthlyAccrualRate) || monthlyAccrualRate < 0)
  ) {
    return NextResponse.json({ error: "monthlyAccrualRate must be >= 0 for monthly accrual" }, { status: 400 });
  }
  if (!isValidYmd(effectiveFromRaw)) {
    return NextResponse.json({ error: "effectiveFrom must be yyyy-mm-dd" }, { status: 400 });
  }
  if (effectiveToRaw != null && !isValidYmd(effectiveToRaw)) {
    return NextResponse.json({ error: "effectiveTo must be yyyy-mm-dd or empty" }, { status: 400 });
  }
  if (effectiveToRaw != null && effectiveToRaw < effectiveFromRaw) {
    return NextResponse.json({ error: "effectiveTo must be on or after effectiveFrom" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: lt, error: ltErr } = await supabase
    .from("HRMS_leave_types")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (ltErr) return NextResponse.json({ error: ltErr.message }, { status: 400 });
  if (!lt) return NextResponse.json({ error: "Invalid leaveTypeId" }, { status: 400 });

  // Load existing versions for this type (company-scoped).
  const { data: existing, error: exErr } = await supabase
    .from("HRMS_leave_policies")
    .select("id, effective_from, effective_to")
    .eq("company_id", me.company_id)
    .eq("leave_type_id", leaveTypeId);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 });

  const newFrom = effectiveFromRaw;
  const newTo = effectiveToRaw;

  // Close any version that would overlap the new window by setting effective_to = day before newFrom
  // when the prior version is open-ended or extends into the new period.
  for (const row of existing ?? []) {
    const from = ymdOnly((row as any).effective_from) || "2000-01-01";
    const to = (row as any).effective_to != null ? ymdOnly((row as any).effective_to) : null;

    // Exact same start → reject (unique index); ask admin to pick another date.
    if (from === newFrom) {
      return NextResponse.json(
        { error: "A policy version already starts on this effective date. Choose a different date." },
        { status: 400 },
      );
    }

    const overlaps =
      from <= (newTo ?? "9999-12-31") && (to == null || to >= newFrom);
    if (!overlaps) continue;

    if (from < newFrom && (to == null || to >= newFrom)) {
      const closeTo = dayBeforeYmd(newFrom);
      if (closeTo < from) {
        return NextResponse.json(
          { error: "Cannot insert this effective date without overlapping an existing version." },
          { status: 400 },
        );
      }
      const { error: closeErr } = await supabase
        .from("HRMS_leave_policies")
        .update({ effective_to: closeTo, updated_at: new Date().toISOString() })
        .eq("id", (row as any).id)
        .eq("company_id", me.company_id);
      if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 400 });
      continue;
    }

    // Future version that starts inside our window — block rather than delete history.
    if (from >= newFrom && (newTo == null || from <= newTo)) {
      return NextResponse.json(
        {
          error:
            "A later policy version already exists in this date range. Adjust effective dates or edit that version.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("HRMS_leave_policies")
    .insert([
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
        effective_from: newFrom,
        effective_to: newTo,
        request_enabled: Boolean(requestEnabled),
        updated_at: new Date().toISOString(),
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ policy: data });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const leaveTypeId = searchParams.get("leaveTypeId") || "";
  const policyId = searchParams.get("policyId") || "";
  if (!leaveTypeId && !policyId) {
    return NextResponse.json({ error: "leaveTypeId or policyId is required" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  let query = supabase.from("HRMS_leave_policies").delete().eq("company_id", me.company_id);
  if (policyId) query = query.eq("id", policyId);
  else query = query.eq("leave_type_id", leaveTypeId);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
