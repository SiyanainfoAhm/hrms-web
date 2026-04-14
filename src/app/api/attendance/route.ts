import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { effectiveLunchBreakMinutes } from "@/lib/attendancePolicy";

/** Calendar date (YYYY-MM-DD) in Asia/Kolkata — matches typical Indian office "today" for attendance. */
function workDateIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function clampMinutes(n: number): number {
  return Math.min(24 * 60, Math.max(0, Math.round(n)));
}

function addAccumulatedMinutes(accumMin: number, startedAtIso: string | null | undefined, nowIso: string): number {
  const base = clampMinutes(Number(accumMin) || 0);
  if (!startedAtIso) return base;
  const s = new Date(String(startedAtIso)).getTime();
  const n = new Date(nowIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(n) || n <= s) return base;
  return clampMinutes(base + Math.round((n - s) / 60000));
}

type AttendanceRow = {
  id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  lunch_break_minutes: number | null;
  tea_break_minutes: number | null;
  lunch_break_started_at?: string | null;
  tea_break_started_at?: string | null;
  lunch_check_out_at?: string | null;
  lunch_check_in_at?: string | null;
  tea_check_out_at?: string | null;
  tea_check_in_at?: string | null;
};

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
  if (!me?.company_id) {
    return NextResponse.json({ hasEmployee: false, workDate: workDateIST(), log: null });
  }

  const { data: emp, error: empErr } = await supabase
    .from("HRMS_employees")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("user_id", session.id)
    .maybeSingle();
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
  if (!emp?.id) {
    return NextResponse.json({ hasEmployee: false, workDate: workDateIST(), log: null });
  }

  const wd = workDateIST();
  const { data: log, error: logErr } = await supabase
    .from("HRMS_attendance_logs")
    .select(
      "id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, status"
    )
    .eq("company_id", me.company_id)
    .eq("employee_id", emp.id)
    .eq("work_date", wd)
    .maybeSingle();
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  return NextResponse.json({
    hasEmployee: true,
    workDate: wd,
    log,
  });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const actionRaw = typeof body?.action === "string" ? body.action : "";
  const action =
    actionRaw === "in" || actionRaw === "out" || actionRaw === "break"
      ? (actionRaw as "in" | "out" | "break")
      : "in";
  const breakKind = body?.kind === "tea" ? "tea" : body?.kind === "lunch" ? "lunch" : null;
  const lunchBreakMinutes = clampMinutes(Number(body?.lunchBreakMinutes) || 0);
  const teaBreakMinutes = clampMinutes(Number(body?.teaBreakMinutes) || 0);
  const allowRepunchOut = body?.allowRepunchOut === true;

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) {
    return NextResponse.json({ error: "User not linked to company" }, { status: 400 });
  }

  const { data: emp, error: empErr } = await supabase
    .from("HRMS_employees")
    .select("id")
    .eq("company_id", me.company_id)
    .eq("user_id", session.id)
    .maybeSingle();
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });
  if (!emp?.id) {
    return NextResponse.json(
      { error: "No employee profile found. Ask HR to complete your employee record before marking attendance." },
      { status: 400 }
    );
  }

  const wd = workDateIST();
  const nowIso = new Date().toISOString();

  const { data: existing, error: exErr } = await supabase
    .from("HRMS_attendance_logs")
    .select(
      "id, check_in_at, check_out_at, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at"
    )
    .eq("company_id", me.company_id)
    .eq("employee_id", emp.id)
    .eq("work_date", wd)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 });

  if (action === "break") {
    if (!breakKind) return NextResponse.json({ error: "Invalid break kind" }, { status: 400 });
    if (!existing?.check_in_at) return NextResponse.json({ error: "Punch in first before starting breaks." }, { status: 400 });
    if (existing?.check_out_at) return NextResponse.json({ error: "Attendance already completed for today." }, { status: 400 });

    const row = existing as AttendanceRow;
    const lunchStarted = row.lunch_break_started_at ?? null;
    const teaStarted = row.tea_break_started_at ?? null;
    const lunchMinBase = clampMinutes(Number(row.lunch_break_minutes) || 0);
    const teaMinBase = clampMinutes(Number(row.tea_break_minutes) || 0);

    // Toggle semantics:
    // - starting a break stops the other break (if running) and accumulates it
    // - stopping a break accumulates it and clears started_at
    const isRunning = breakKind === "lunch" ? !!lunchStarted : !!teaStarted;
    let nextLunchStarted: string | null = lunchStarted;
    let nextTeaStarted: string | null = teaStarted;
    let nextLunchMin = lunchMinBase;
    let nextTeaMin = teaMinBase;

    let nextLunchOutAt: string | null | undefined = (row as AttendanceRow).lunch_check_out_at ?? null;
    let nextLunchInAt: string | null | undefined = (row as AttendanceRow).lunch_check_in_at ?? null;
    let nextTeaOutAt: string | null | undefined = (row as AttendanceRow).tea_check_out_at ?? null;
    let nextTeaInAt: string | null | undefined = (row as AttendanceRow).tea_check_in_at ?? null;

    if (isRunning) {
      // stop this break
      if (breakKind === "lunch") {
        nextLunchMin = addAccumulatedMinutes(lunchMinBase, lunchStarted, nowIso);
        nextLunchStarted = null;
        nextLunchInAt = nowIso;
      } else {
        nextTeaMin = addAccumulatedMinutes(teaMinBase, teaStarted, nowIso);
        nextTeaStarted = null;
        nextTeaInAt = nowIso;
      }
    } else {
      // stop other break if running
      if (breakKind === "lunch" && teaStarted) {
        nextTeaMin = addAccumulatedMinutes(teaMinBase, teaStarted, nowIso);
        nextTeaStarted = null;
        nextTeaInAt = nowIso;
      }
      if (breakKind === "tea" && lunchStarted) {
        nextLunchMin = addAccumulatedMinutes(lunchMinBase, lunchStarted, nowIso);
        nextLunchStarted = null;
        nextLunchInAt = nowIso;
      }
      // start this break
      if (breakKind === "lunch") {
        nextLunchStarted = nowIso;
        if (!nextLunchOutAt) nextLunchOutAt = nowIso;
      } else {
        nextTeaStarted = nowIso;
        if (!nextTeaOutAt) nextTeaOutAt = nowIso;
      }
    }

    const { data: updated, error: upErr } = await supabase
      .from("HRMS_attendance_logs")
      .update({
        lunch_break_minutes: nextLunchMin,
        tea_break_minutes: nextTeaMin,
        lunch_break_started_at: nextLunchStarted,
        tea_break_started_at: nextTeaStarted,
        lunch_check_out_at: nextLunchOutAt ?? null,
        lunch_check_in_at: nextLunchInAt ?? null,
        tea_check_out_at: nextTeaOutAt ?? null,
        tea_check_in_at: nextTeaInAt ?? null,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .select(
        "id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at, status"
      )
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, log: updated });
  }

  if (action === "in") {
    if (existing?.check_in_at && existing?.check_out_at) {
      return NextResponse.json({ error: "Today's attendance is already complete." }, { status: 400 });
    }
    if (existing?.check_in_at && !existing?.check_out_at) {
      return NextResponse.json({ error: "You are already punched in. Punch out to end your shift." }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("HRMS_attendance_logs")
      .insert([
        {
          company_id: me.company_id,
          employee_id: emp.id,
          work_date: wd,
          check_in_at: nowIso,
          check_out_at: null,
          lunch_break_minutes: 0,
          tea_break_minutes: 0,
          lunch_break_started_at: null,
          tea_break_started_at: null,
          lunch_check_out_at: null,
          lunch_check_in_at: null,
          tea_check_out_at: null,
          tea_check_in_at: null,
          total_hours: null,
          status: "present",
          updated_at: nowIso,
        },
      ])
      .select(
        "id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at, status"
      )
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, log: inserted });
  }

  // punch out
  if (!existing?.check_in_at) {
    return NextResponse.json({ error: "Punch in first before punching out." }, { status: 400 });
  }
  if (existing?.check_out_at && !allowRepunchOut) {
    return NextResponse.json(
      { error: "You have already punched out for today. Use update punch-out to correct it." },
      { status: 400 }
    );
  }

  const rowPre = existing as AttendanceRow;
  if (rowPre.lunch_break_started_at) {
    return NextResponse.json(
      { error: "End lunch (check in after lunch) before final check out." },
      { status: 400 }
    );
  }
  if (rowPre.tea_break_started_at) {
    return NextResponse.json({ error: "End tea break before final check out." }, { status: 400 });
  }

  const inMs = new Date(String(existing.check_in_at)).getTime();
  const outMs = new Date(nowIso).getTime();
  if (outMs <= inMs) {
    return NextResponse.json({ error: "Invalid punch out time." }, { status: 400 });
  }
  const row = existing as AttendanceRow;
  // Finalize any running breaks on punch out (so payroll is correct even if user forgets to end break)
  const finalLunchMin = addAccumulatedMinutes(
    Number(row.lunch_break_minutes) || 0,
    row.lunch_break_started_at ?? null,
    nowIso
  );
  const finalTeaMin = addAccumulatedMinutes(
    Number(row.tea_break_minutes) || 0,
    row.tea_break_started_at ?? null,
    nowIso
  );

  const grossMinutes = Math.round((outMs - inMs) / 60000);
  const totalHours = Math.round((grossMinutes / 60) * 100) / 100;

  const mergedLunchRecorded = Math.max(finalLunchMin, lunchBreakMinutes);
  const lunchMinutesStored = effectiveLunchBreakMinutes({
    recordedLunchMinutes: mergedLunchRecorded,
    lunchCheckOutAt: row.lunch_check_out_at,
    lunchCheckInAt: row.lunch_check_in_at,
    grossWorkMinutes: grossMinutes,
  });

  const { data: updated, error: upErr } = await supabase
    .from("HRMS_attendance_logs")
    .update({
      check_out_at: nowIso,
      lunch_break_minutes: lunchMinutesStored,
      tea_break_minutes: Math.max(finalTeaMin, teaBreakMinutes),
      lunch_break_started_at: null,
      tea_break_started_at: null,
      tea_check_in_at: row.tea_break_started_at ? nowIso : (row as AttendanceRow).tea_check_in_at ?? null,
      total_hours: totalHours,
      status: "present",
      updated_at: nowIso,
    })
    .eq("id", existing.id)
    .select(
      "id, work_date, check_in_at, check_out_at, total_hours, lunch_break_minutes, tea_break_minutes, lunch_break_started_at, tea_break_started_at, lunch_check_out_at, lunch_check_in_at, tea_check_out_at, tea_check_in_at, status"
    )
    .single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, log: updated });
}
