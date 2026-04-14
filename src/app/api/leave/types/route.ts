import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

const PAYSLIP_SLOTS = new Set(["CL", "EL", "HPL", "HL"]);

function normalizePayslipSlot(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim().toUpperCase();
  return PAYSLIP_SLOTS.has(s) ? s : null;
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
  if (!me?.company_id) return NextResponse.json({ types: [] });

  let query = supabase
    .from("HRMS_leave_types")
    .select("*, HRMS_leave_policies(*)")
    .eq("company_id", me.company_id)
    .order("name", { ascending: true });
  if (!isManagerial(session.role)) {
    // Employees can request only paid leave types (e.g. Sick, Paid)
    query = query.eq("is_paid", true);
  }
  let { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Auto-seed defaults for new companies so dropdown isn't empty.
  // Unique constraint (company_id, name) + upsert keeps this idempotent.
  if ((data ?? []).length === 0) {
    const { data: seededTypes, error: seedErr } = await supabase
      .from("HRMS_leave_types")
      .upsert(
        [
          { company_id: me.company_id, name: "Earned Leave", code: "PAID", is_paid: true, payslip_slot: "EL" },
          { company_id: me.company_id, name: "Casual Leave", code: "SICK", is_paid: true, payslip_slot: "CL" },
          { company_id: me.company_id, name: "Unpaid Leave", code: "UNPAID", is_paid: false, payslip_slot: null },
          {
            company_id: me.company_id,
            name: "Half Leave",
            code: "HL",
            is_paid: true,
            payslip_slot: "HL",
            description: "Half-day leave (counts in days, e.g. 0.5)",
          },
          {
            company_id: me.company_id,
            name: "Half Pay Leave",
            code: "HPL",
            is_paid: true,
            payslip_slot: "HPL",
            description: "Leave on half pay",
          },
        ],
        { onConflict: "company_id,name" },
      )
      .select("id, name, code, is_paid")
      .returns<{ id: string; name: string; code: string | null; is_paid: boolean }[]>();
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 400 });

    // Seed default policies too (idempotent).
    const paid = (seededTypes ?? []).find((t) => t.code === "PAID");
    const sick = (seededTypes ?? []).find((t) => t.code === "SICK");
    const unpaid = (seededTypes ?? []).find((t) => t.code === "UNPAID");
    const hl = (seededTypes ?? []).find((t) => t.code === "HL");
    const hpl = (seededTypes ?? []).find((t) => t.code === "HPL");
    const policies = [
      paid && {
        company_id: me.company_id,
        leave_type_id: paid.id,
        accrual_method: "monthly",
        monthly_accrual_rate: 1,
        annual_quota: 12,
        prorate_on_join: true,
        reset_month: 1,
        reset_day: 1,
      },
      sick && {
        company_id: me.company_id,
        leave_type_id: sick.id,
        accrual_method: "annual",
        annual_quota: 3,
        prorate_on_join: false,
        reset_month: 1,
        reset_day: 1,
      },
      unpaid && {
        company_id: me.company_id,
        leave_type_id: unpaid.id,
        accrual_method: "none",
        annual_quota: null,
        prorate_on_join: false,
        reset_month: 1,
        reset_day: 1,
      },
      hl && {
        company_id: me.company_id,
        leave_type_id: hl.id,
        accrual_method: "monthly",
        monthly_accrual_rate: 0.5,
        annual_quota: 6,
        prorate_on_join: true,
        reset_month: 1,
        reset_day: 1,
      },
      hpl && {
        company_id: me.company_id,
        leave_type_id: hpl.id,
        accrual_method: "annual",
        annual_quota: 3,
        prorate_on_join: true,
        reset_month: 1,
        reset_day: 1,
      },
    ].filter(Boolean) as any[];

    if (policies.length) {
      const { error: polErr } = await supabase.from("HRMS_leave_policies").upsert(policies, { onConflict: "company_id,leave_type_id" });
      if (polErr) return NextResponse.json({ error: polErr.message }, { status: 400 });
    }

    // Re-run original query (respects employee paid-only filter)
    const refreshed = await query;
    data = refreshed.data ?? [];
    error = refreshed.error ?? null;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ types: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : undefined;
  const description = typeof body?.description === "string" ? body.description.trim() : undefined;
  const isPaid = body?.isPaid === undefined ? true : Boolean(body.isPaid);
  const annualQuota = body?.annualQuota ?? null;
  const payslipSlot = normalizePayslipSlot(body?.payslipSlot ?? body?.payslip_slot);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_leave_types")
    .insert([
      {
        company_id: me.company_id,
        name,
        code: code || null,
        description: description || null,
        is_paid: isPaid,
        annual_quota: annualQuota,
        payslip_slot: payslipSlot,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ type: data });
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const nameRaw = body?.name;
  const name = typeof nameRaw === "string" ? nameRaw.trim() : undefined;
  const hasSlot = "payslipSlot" in body || "payslip_slot" in body;
  const payslipSlot = hasSlot ? normalizePayslipSlot(body?.payslipSlot ?? body?.payslip_slot) : undefined;

  if (name === undefined && !hasSlot) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    patch.name = name;
  }
  if (hasSlot) patch.payslip_slot = payslipSlot;

  const { data, error } = await supabase
    .from("HRMS_leave_types")
    .update(patch)
    .eq("id", id)
    .eq("company_id", me.company_id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });

  return NextResponse.json({ type: data });
}

