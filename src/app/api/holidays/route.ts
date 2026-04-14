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
  if (!me?.company_id) return NextResponse.json({ holidays: [] });

  const { data, error } = await supabase
    .from("HRMS_holidays")
    .select("*")
    .eq("company_id", me.company_id)
    .order("holiday_date", { ascending: true });
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

  const { data, error } = await supabase
    .from("HRMS_holidays")
    .insert([
      {
        company_id: me.company_id,
        name,
        holiday_date: holidayDate,
        holiday_end_date: holidayEndDate,
        location: location || null,
        is_optional: isOptional,
      },
    ])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ holiday: data });
}

