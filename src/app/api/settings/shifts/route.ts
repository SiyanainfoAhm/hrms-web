import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

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

function parseTime24ToMinutes(value: string): number | null {
  const v = value.trim();
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function validateShiftTimes(startTime: string, endTime: string, isNightShift: boolean): string | null {
  const s = parseTime24ToMinutes(startTime);
  const e = parseTime24ToMinutes(endTime);
  if (s === null || e === null) return "Time must be in 24-hour format HH:MM (e.g. 09:00)";
  if (s === e) return "Start and end time cannot be the same";
  if (!isNightShift && e <= s) return "End time must be after start time (use Night shift for overnight shifts)";
  return null;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ shifts: [] });

  const { data, error } = await supabase
    .from("HRMS_shifts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shifts: data ?? [] });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = await getCompanyId(session.id);
  if (!companyId) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const startTime = typeof body?.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body?.endTime === "string" ? body.endTime.trim() : "";
  const isNightShift = Boolean(body?.isNightShift);
  if (!name || !startTime || !endTime) {
    return NextResponse.json({ error: "Name, start time and end time are required" }, { status: 400 });
  }
  const timeError = validateShiftTimes(startTime, endTime, isNightShift);
  if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_shifts")
    .insert([{ company_id: companyId, name, start_time: startTime, end_time: endTime, is_night_shift: isNightShift }])
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shift: data });
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
  if (!id) return NextResponse.json({ error: "Shift id is required" }, { status: 400 });

  const payload: Record<string, any> = {
    name: typeof body?.name === "string" ? body.name.trim() : undefined,
    start_time: typeof body?.startTime === "string" ? body.startTime.trim() : undefined,
    end_time: typeof body?.endTime === "string" ? body.endTime.trim() : undefined,
    is_night_shift: body?.isNightShift === undefined ? undefined : Boolean(body.isNightShift),
  };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  if (payload.start_time !== undefined || payload.end_time !== undefined || payload.is_night_shift !== undefined) {
    const start = String(payload.start_time ?? "");
    const end = String(payload.end_time ?? "");
    const night = Boolean(payload.is_night_shift);
    if (!start || !end) return NextResponse.json({ error: "Start time and end time are required" }, { status: 400 });
    const timeError = validateShiftTimes(start, end, night);
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("HRMS_shifts")
    .update(payload)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shift: data });
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
  if (!id) return NextResponse.json({ error: "Shift id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("HRMS_shifts")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shift: data });
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
  if (!id) return NextResponse.json({ error: "Shift id is required" }, { status: 400 });

  const { error } = await supabase.from("HRMS_shifts").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

