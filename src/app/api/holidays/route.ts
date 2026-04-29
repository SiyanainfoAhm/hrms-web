import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

/** Only Super Admin may create/update/delete company holidays. */
function canManageHolidays(role: string): boolean {
  return role === "super_admin";
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** End date null or same as start = single-day holiday. */
function normalizeHolidayEnd(start: string, endRaw: string | undefined): string | null {
  if (!endRaw || !isYmd(endRaw)) return null;
  if (endRaw < start) return null;
  if (endRaw === start) return null;
  return endRaw;
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
  if (!me?.company_id) return NextResponse.json({ holidays: [] });

  // Super admin can filter by division tab; employees see only their division + global (division_id null).
  const { searchParams } = new URL(request.url);
  const divisionIdParam = (searchParams.get("divisionId") || "").trim();

  let divisionIdForFilter: string | null = null;
  if (canManageHolidays(session.role)) {
    // divisionIdParam: "" or "ALL" means no filter.
    if (divisionIdParam && divisionIdParam.toUpperCase() !== "ALL") {
      divisionIdForFilter = divisionIdParam;
    } else {
      divisionIdForFilter = null;
    }
  } else {
    const { data: emp, error: empErr } = await supabase
      .from("HRMS_employees")
      .select("division_id")
      .eq("company_id", me.company_id)
      .eq("user_id", session.id)
      .maybeSingle();
    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
    divisionIdForFilter = (emp as any)?.division_id ? String((emp as any).division_id) : null;
  }

  let q = supabase.from("HRMS_holidays").select("*").eq("company_id", me.company_id);
  if (divisionIdForFilter && !canManageHolidays(session.role)) {
    // employee: global + their division
    q = q.or(`division_id.is.null,division_id.eq.${divisionIdForFilter}`);
  } else if (divisionIdForFilter && canManageHolidays(session.role)) {
    // admin: exact division filter (no global unless stored with this division)
    q = q.eq("division_id", divisionIdForFilter);
  }
  const { data, error } = await q.order("holiday_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ holidays: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageHolidays(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const holidayDate = typeof body?.holidayDate === "string" ? body.holidayDate.trim() : "";
  const holidayEndDateRaw =
    typeof body?.holidayEndDate === "string" ? body.holidayEndDate.trim() : undefined;
  const location = typeof body?.location === "string" ? body.location.trim() : undefined;
  const divisionId =
    body?.divisionId === null
      ? null
      : typeof body?.divisionId === "string"
        ? body.divisionId.trim() || null
        : undefined;
  const isOptional = Boolean(body?.isOptional);
  if (!name || !holidayDate) return NextResponse.json({ error: "Name and date are required" }, { status: 400 });
  if (!isYmd(holidayDate)) return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  if (holidayEndDateRaw && !isYmd(holidayEndDateRaw)) {
    return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
  }
  if (holidayEndDateRaw && holidayEndDateRaw < holidayDate) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }
  const holidayEndDate = normalizeHolidayEnd(holidayDate, holidayEndDateRaw);

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  if (divisionId !== undefined && divisionId !== null) {
    const { data: div, error: divErr } = await supabase
      .from("HRMS_divisions")
      .select("id")
      .eq("company_id", me.company_id)
      .eq("id", divisionId)
      .maybeSingle();
    if (divErr) return NextResponse.json({ error: divErr.message }, { status: 400 });
    if (!div) return NextResponse.json({ error: "Invalid division" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("HRMS_holidays")
    .insert([
      {
        company_id: me.company_id,
        name,
        holiday_date: holidayDate,
        holiday_end_date: holidayEndDate,
        location: location || null,
        division_id: divisionId === undefined ? null : divisionId,
        is_optional: isOptional,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ holiday: data });
}

