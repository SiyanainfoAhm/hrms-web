import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function canManageHolidays(role: string): boolean {
  return role === "super_admin";
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeHolidayEnd(start: string, endRaw: string | undefined): string | null {
  if (!endRaw || !isYmd(endRaw)) return null;
  if (endRaw < start) return null;
  if (endRaw === start) return null;
  return endRaw;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageHolidays(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const holidayDate = typeof body?.holidayDate === "string" ? body.holidayDate.trim() : undefined;
  const holidayEndDateInBody = "holidayEndDate" in body;
  const holidayEndDateRaw =
    body?.holidayEndDate === null
      ? null
      : typeof body?.holidayEndDate === "string"
        ? body.holidayEndDate.trim()
        : undefined;
  const location =
    body?.location === null
      ? null
      : typeof body?.location === "string"
        ? body.location.trim() || null
        : undefined;
  const isOptional = typeof body?.isOptional === "boolean" ? body.isOptional : undefined;

  if (name !== undefined && !name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  if (holidayDate !== undefined && !isYmd(holidayDate)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const needsRow =
    holidayEndDateInBody || (holidayDate !== undefined && !holidayEndDateInBody);
  const { data: existing } = needsRow
    ? await supabase
        .from("HRMS_holidays")
        .select("holiday_date, holiday_end_date")
        .eq("id", id)
        .eq("company_id", me.company_id)
        .maybeSingle()
    : { data: null as { holiday_date: string; holiday_end_date: string | null } | null };

  if (needsRow && !existing) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });

  const startStr = holidayDate !== undefined
    ? holidayDate
    : existing
      ? String(existing.holiday_date).slice(0, 10)
      : "";
  const currentEndStr = existing?.holiday_end_date
    ? String(existing.holiday_end_date).slice(0, 10)
    : null;

  if (holidayDate !== undefined && !holidayEndDateInBody && currentEndStr && holidayDate > currentEndStr) {
    return NextResponse.json(
      { error: "Start date cannot be after the holiday end date. Change the end date first or clear the range." },
      { status: 400 },
    );
  }

  if (holidayEndDateInBody) {
    if (!startStr) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    if (holidayEndDateRaw !== null && holidayEndDateRaw !== undefined && !isYmd(holidayEndDateRaw)) {
      return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
    }
    if (holidayEndDateRaw && holidayEndDateRaw < startStr) {
      return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
    }
  }

  const payload: Record<string, unknown> = {};
  if (name !== undefined) payload.name = name;
  if (holidayDate !== undefined) payload.holiday_date = holidayDate;
  if (location !== undefined) payload.location = location;
  if (isOptional !== undefined) payload.is_optional = isOptional;

  if (holidayEndDateInBody) {
    if (holidayEndDateRaw === null || holidayEndDateRaw === undefined || holidayEndDateRaw === "") {
      payload.holiday_end_date = null;
    } else {
      payload.holiday_end_date = normalizeHolidayEnd(startStr, holidayEndDateRaw);
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("HRMS_holidays")
    .update(payload)
    .eq("id", id)
    .eq("company_id", me.company_id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });

  return NextResponse.json({ holiday: data });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageHolidays(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { error } = await supabase
    .from("HRMS_holidays")
    .delete()
    .eq("id", id)
    .eq("company_id", me.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
