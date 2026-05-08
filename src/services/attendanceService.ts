/**
 * Thin client-side wrapper around the existing /api/attendance,
 * /api/attendance/me, and /api/agent/heartbeat routes.
 *
 * Both the dashboard form (DashboardContent) and the HRMS chatbot
 * agent must go through this service, so:
 *   - permissions, validation, geofence checks, lunch/tea toggle
 *     semantics, and HRMS_attendance_state upserts (which the
 *     Tauri desktop agent reads) are computed exactly once on the
 *     server.
 *   - we never write to Supabase tables directly from UI code.
 *
 * The functions here intentionally do nothing the original `fetch`
 * calls did not do; they just give us a typed, reusable API.
 */
import type { AttendanceTimeZoneId } from "@/lib/attendanceTimeZone";

export type AttendanceLogRow = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_hours: number | null;
  lunch_break_minutes: number | null;
  tea_break_minutes: number | null;
  lunch_break_started_at?: string | null;
  tea_break_started_at?: string | null;
  lunch_check_out_at?: string | null;
  lunch_check_in_at?: string | null;
  tea_check_out_at?: string | null;
  tea_check_in_at?: string | null;
  lunch_break_segments?: { out: string; in: string }[] | null;
  tea_break_segments?: { out: string; in: string }[] | null;
  status: string | null;
  in_office?: boolean | null;
  office_note?: string | null;
  notes?: string | null;
};

export type AttendanceTodayResponse = {
  hasEmployee: boolean;
  workDate: string | null;
  timeZone: AttendanceTimeZoneId | null;
  log: AttendanceLogRow | null;
};

export type GeoLocation = { lat: number; lng: number; accuracyM: number };

export type PunchResult = {
  ok: true;
  log: AttendanceLogRow;
  warning?: string | null;
};

export type AgentHeartbeatStatus = {
  connected: boolean;
  lastSeenAt: string | null;
  appVersion: string | null;
  deviceName: string | null;
};

/** Browser geolocation. The chatbot reuses the same geofence flow as the
 * dashboard "Punch in/out" buttons — server still rejects on missing or
 * out-of-radius location. */
export async function getCurrentLocation(): Promise<GeoLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<GeoLocation | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

async function postAttendance(body: Record<string, unknown>): Promise<PunchResult> {
  const res = await fetch("/api/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const msg = typeof (data as { error?: unknown }).error === "string"
      ? String((data as { error?: unknown }).error)
      : "Attendance request failed";
    throw new Error(msg);
  }
  return data as PunchResult;
}

export async function getTodayAttendanceStatus(): Promise<AttendanceTodayResponse | null> {
  const res = await fetch("/api/attendance");
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as AttendanceTodayResponse | null;
  return data;
}

export async function punchIn(args?: {
  location?: GeoLocation | null;
}): Promise<PunchResult> {
  const location = args?.location ?? (await getCurrentLocation());
  if (!location) {
    throw new Error("Location permission is required to punch in. Please allow location access and try again.");
  }
  return postAttendance({ action: "in", location });
}

export async function punchOut(args?: {
  location?: GeoLocation | null;
  allowRepunchOut?: boolean;
}): Promise<PunchResult> {
  const location = args?.location ?? (await getCurrentLocation());
  if (!location) {
    throw new Error("Location permission is required to punch out. Please allow location access and try again.");
  }
  return postAttendance({
    action: "out",
    location,
    allowRepunchOut: args?.allowRepunchOut === true ? true : undefined,
  });
}

/** Toggles lunch/tea using the same server semantics as the dashboard
 * "Check out for lunch" / "Check in after lunch" buttons (toggle by kind). */
export async function toggleBreak(kind: "lunch" | "tea"): Promise<PunchResult> {
  return postAttendance({ action: "break", kind });
}

export async function lunchOut(): Promise<PunchResult> {
  return toggleBreak("lunch");
}

export async function lunchIn(): Promise<PunchResult> {
  return toggleBreak("lunch");
}

export async function teaOut(): Promise<PunchResult> {
  return toggleBreak("tea");
}

export async function teaIn(): Promise<PunchResult> {
  return toggleBreak("tea");
}

export async function getAgentHeartbeat(): Promise<AgentHeartbeatStatus | null> {
  const res = await fetch("/api/agent/heartbeat");
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const hb = (data as { heartbeat?: Record<string, unknown> }).heartbeat ?? null;
  if (!hb) return null;
  const last = hb.lastSeenAt != null ? String(hb.lastSeenAt) : null;
  const lastMs = last ? new Date(last).getTime() : NaN;
  return {
    connected: Number.isFinite(lastMs) && Date.now() - lastMs <= 60_000,
    lastSeenAt: last,
    appVersion: hb.appVersion != null ? String(hb.appVersion) : null,
    deviceName: hb.deviceName != null ? String(hb.deviceName) : null,
  };
}

export type AttendanceStatusLabel =
  | "not_punched_in"
  | "punched_in"
  | "on_lunch"
  | "on_tea"
  | "completed";

export function deriveAttendanceStatusLabel(log: AttendanceLogRow | null | undefined): AttendanceStatusLabel {
  if (!log?.check_in_at) return "not_punched_in";
  if (log.check_out_at) return "completed";
  if (log.lunch_break_started_at) return "on_lunch";
  if (log.tea_break_started_at) return "on_tea";
  return "punched_in";
}
