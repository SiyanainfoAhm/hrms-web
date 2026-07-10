// @ts-nocheck — Deno runtime; file is excluded from the Next.js tsc build.
// Supabase Edge Function: monthly-holiday-emails
//
// Builds one consolidated holiday-list email per active employee for the
// current calendar month (Asia/Kolkata). Returns HTML bodies for Power Automate
// to send — this function does not send email itself.
//
// Deploy:
//   supabase functions deploy monthly-holiday-emails --no-verify-jwt
//
// Secrets (set in Supabase dashboard):
//   HRMS_POWER_AUTOMATE_SECRET
//   HRMS_DEFAULT_COMPANY_ID
//
// Platform env (automatic):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const KOLKATA_TZ = "Asia/Kolkata";
const AUTOMATION_HEADER = "x-hrms-automation-key";

type HolidayRow = {
  id?: string;
  name: string;
  holiday_date: string;
  holiday_end_date?: string | null;
  location?: string | null;
  division_id?: string | null;
};

type ExpandedHoliday = {
  dateYmd: string;
  name: string;
  location: string | null;
  divisionId: string | null;
};

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
  division_id: string | null;
};

type MonthContext = {
  emailPeriod: string;
  monthLabel: string;
  firstDay: string;
  lastDay: string;
};

type EmployeeEmail = {
  employeeId: string;
  employeeName: string;
  division: string;
  toEmail: string;
  subject: string;
  body: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function verifyAutomationSecret(req: Request, expected: string): boolean {
  if (!expected) return false;
  const provided = req.headers.get(AUTOMATION_HEADER) ?? "";
  return timingSafeEqual(provided, expected);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ymdFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getKolkataDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { year, month, day };
}

function getFirstDayOfMonth(year: number, month: number): string {
  return ymdFromParts(year, month, 1);
}

function getLastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return ymdFromParts(year, month, lastDay);
}

function getCurrentMonthInKolkata(date = new Date()): MonthContext {
  const { year, month } = getKolkataDateParts(date);
  const firstDay = getFirstDayOfMonth(year, month);
  const lastDay = getLastDayOfMonth(year, month);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: KOLKATA_TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(`${firstDay}T12:00:00Z`));
  return { emailPeriod: firstDay, monthLabel, firstDay, lastDay };
}

function eachYmdInRange(startYmd: string, endYmd: string): string[] {
  if (!isYmd(startYmd) || !isYmd(endYmd) || endYmd < startYmd) return [];
  const out: string[] = [];
  let y = parseInt(startYmd.slice(0, 4), 10);
  let m = parseInt(startYmd.slice(5, 7), 10);
  let d = parseInt(startYmd.slice(8, 10), 10);
  const endMs = new Date(`${endYmd}T00:00:00Z`).getTime();
  for (;;) {
    const cur = ymdFromParts(y, m, d);
    if (new Date(`${cur}T00:00:00Z`).getTime() > endMs) break;
    out.push(cur);
    const next = new Date(`${cur}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return out;
}

function expandHolidayRows(holidays: HolidayRow[], firstDay: string, lastDay: string): ExpandedHoliday[] {
  const expanded: ExpandedHoliday[] = [];
  for (const holiday of holidays) {
    const start = String(holiday.holiday_date ?? "").slice(0, 10);
    if (!isYmd(start)) continue;
    const endRaw = holiday.holiday_end_date ? String(holiday.holiday_end_date).slice(0, 10) : start;
    const end = isYmd(endRaw) && endRaw >= start ? endRaw : start;
    const name = String(holiday.name ?? "").trim() || "Holiday";
    const location = holiday.location ? String(holiday.location).trim() : null;
    const divisionId = holiday.division_id ? String(holiday.division_id) : null;
    for (const dateYmd of eachYmdInRange(start, end)) {
      if (dateYmd < firstDay || dateYmd > lastDay) continue;
      expanded.push({ dateYmd, name, location, divisionId });
    }
  }
  return expanded;
}

function holidayMatchesDivision(holiday: ExpandedHoliday, employeeDivisionId: string | null): boolean {
  if (!holiday.divisionId) return true;
  if (!employeeDivisionId) return true;
  return holiday.divisionId === employeeDivisionId;
}

function removeDuplicateHolidays(holidays: ExpandedHoliday[]): ExpandedHoliday[] {
  const seen = new Set<string>();
  const out: ExpandedHoliday[] = [];
  for (const holiday of holidays) {
    const key = `${holiday.dateYmd}|${holiday.name}|${holiday.divisionId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(holiday);
  }
  return out;
}

function sortHolidays(holidays: ExpandedHoliday[]): ExpandedHoliday[] {
  return [...holidays].sort((a, b) => {
    if (a.dateYmd !== b.dateYmd) return a.dateYmd.localeCompare(b.dateYmd);
    return a.name.localeCompare(b.name);
  });
}

function formatHolidayDate(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: KOLKATA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDayName(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: KOLKATA_TZ,
    weekday: "long",
  }).format(date);
}

function buildHolidayTableRows(holidays: ExpandedHoliday[]): string {
  if (!holidays.length) {
    return `<tr><td colspan="3" style="padding:14px 12px;color:#64748b;text-align:center;">No holidays this month.</td></tr>`;
  }
  return holidays
    .map((holiday) => {
      const location = holiday.location ? escapeHtml(holiday.location) : "—";
      return `<tr>
        <td style="padding:12px;border-top:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(formatHolidayDate(holiday.dateYmd))}</td>
        <td style="padding:12px;border-top:1px solid #e2e8f0;">${escapeHtml(formatDayName(holiday.dateYmd))}</td>
        <td style="padding:12px;border-top:1px solid #e2e8f0;">
          <strong>${escapeHtml(holiday.name)}</strong>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${location}</div>
        </td>
      </tr>`;
    })
    .join("");
}

function buildHolidayEmailHtml(args: {
  employeeName: string;
  divisionName: string;
  monthLabel: string;
  holidays: ExpandedHoliday[];
}): string {
  const rows = buildHolidayTableRows(args.holidays);
  const employeeName = escapeHtml(args.employeeName);
  const divisionName = escapeHtml(args.divisionName || "—");
  const monthLabel = escapeHtml(args.monthLabel);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#0f172a;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 10px 40px rgba(15,23,42,0.06);">
        <tr><td style="padding:28px 24px 20px;">
          <div style="font-size:12px;color:#64748b;margin-bottom:10px;">HRMS Holiday Calendar</div>
          <div style="font-size:20px;font-weight:700;margin-bottom:6px;">Holiday List for ${monthLabel}</div>
          <div style="font-size:14px;color:#334155;margin-bottom:18px;">Hello ${employeeName}, here are the company holidays applicable to you in ${monthLabel}.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:10px 12px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0;">Date</td>
              <td style="padding:10px 12px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0;">Day</td>
              <td style="padding:10px 12px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0;">Holiday</td>
            </tr>
            ${rows}
          </table>
          <div style="margin-top:18px;font-size:13px;color:#64748b;">Division: <strong style="color:#334155;">${divisionName}</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function filterHolidaysForEmployee(
  holidays: ExpandedHoliday[],
  employeeDivisionId: string | null,
): ExpandedHoliday[] {
  return sortHolidays(
    removeDuplicateHolidays(
      holidays.filter((holiday) => holidayMatchesDivision(holiday, employeeDivisionId)),
    ),
  );
}

function buildEmployeeEmails(args: {
  employees: EmployeeRow[];
  divisionNameById: Map<string, string>;
  month: MonthContext;
  monthHolidays: ExpandedHoliday[];
}): EmployeeEmail[] {
  const emails: EmployeeEmail[] = [];
  for (const employee of args.employees) {
    const toEmail = String(employee.email ?? "").trim();
    const employeeName = String(employee.name ?? "").trim() || "Employee";
    if (!isValidEmail(toEmail)) continue;

    const divisionId = employee.division_id ? String(employee.division_id) : null;
    const applicable = filterHolidaysForEmployee(args.monthHolidays, divisionId);
    if (!applicable.length) continue;

    const division = divisionId ? (args.divisionNameById.get(divisionId) ?? "") : "";
    emails.push({
      employeeId: employee.id,
      employeeName,
      division,
      toEmail,
      subject: `Holiday List for ${args.month.monthLabel}`,
      body: buildHolidayEmailHtml({
        employeeName,
        divisionName: division,
        monthLabel: args.month.monthLabel,
        holidays: applicable,
      }),
    });
  }
  return emails;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const automationSecret = Deno.env.get("HRMS_POWER_AUTOMATE_SECRET") ?? "";
  if (!verifyAutomationSecret(req, automationSecret)) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const companyId = (Deno.env.get("HRMS_DEFAULT_COMPANY_ID") ?? "").trim();
  if (!companyId) {
    return jsonResponse({ success: false, error: "HRMS_DEFAULT_COMPANY_ID is not configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const month = getCurrentMonthInKolkata();

  const { data: holidayRows, error: holidayErr } = await supabase
    .from("HRMS_holidays")
    .select("id, name, holiday_date, holiday_end_date, location, division_id")
    .eq("company_id", companyId)
    .lte("holiday_date", month.lastDay);

  if (holidayErr) {
    return jsonResponse({ success: false, error: holidayErr.message }, 500);
  }

  const monthHolidays = expandHolidayRows((holidayRows ?? []) as HolidayRow[], month.firstDay, month.lastDay);
  if (!monthHolidays.length) {
    return jsonResponse({
      success: true,
      emailPeriod: month.emailPeriod,
      month: month.monthLabel,
      holidayCount: 0,
      employeeCount: 0,
      emails: [],
    });
  }

  const { data: employees, error: employeeErr } = await supabase
    .from("HRMS_users")
    .select("id, name, email, division_id")
    .eq("company_id", companyId)
    .eq("employment_status", "current")
    .neq("role", "super_admin");

  if (employeeErr) {
    return jsonResponse({ success: false, error: employeeErr.message }, 500);
  }

  const divisionIds = [
    ...new Set(
      (employees ?? [])
        .map((row) => (row.division_id ? String(row.division_id) : ""))
        .filter(Boolean),
    ),
  ];

  const divisionNameById = new Map<string, string>();
  if (divisionIds.length) {
    const { data: divisions, error: divisionErr } = await supabase
      .from("HRMS_divisions")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", divisionIds);
    if (divisionErr) {
      return jsonResponse({ success: false, error: divisionErr.message }, 500);
    }
    for (const division of divisions ?? []) {
      divisionNameById.set(String(division.id), String(division.name ?? "").trim());
    }
  }

  const activeEmployees = (employees ?? []) as EmployeeRow[];
  const emails = buildEmployeeEmails({
    employees: activeEmployees,
    divisionNameById,
    month,
    monthHolidays,
  });

  return jsonResponse({
    success: true,
    emailPeriod: month.emailPeriod,
    month: month.monthLabel,
    holidayCount: monthHolidays.length,
    employeeCount: activeEmployees.length,
    emails,
  });
});
