"use client";

import { useHrmsSession } from "@/hooks/useHrmsSession";
import { AttendanceDateFilter, type AttendancePreset } from "@/components/attendance/AttendanceDateFilter";
import { AttendanceScreenshotsDialog } from "@/components/attendance/AttendanceScreenshotsDialog";
import { PaginationBar } from "@/components/common/PaginationBar";
import { SkeletonTable } from "@/components/common/Skeleton";
import { HrmsShellPage } from "@/components/layout/HrmsShellPage";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtDmy } from "@/lib/dateFormat";
import type { AttendanceTimeZoneId } from "@/lib/attendanceTimeZone";
import { IST_TZ, US_EASTERN_TZ, timeZoneLabel } from "@/lib/attendanceTimeZone";
import { notesIndicateAutoPunchOut } from "@/lib/attendanceAutoPunchOut";
import { todayYmdTz } from "@/lib/tzCalendar";
import { minutesBetween, type BreakSegment } from "@/lib/attendanceBreakUtils";

type Row = {
  logId: string;
  workDate: string;
  employeeId: string;
  employeeName: string | null;
  employeeEmail: string;
  checkInAt: string | null;
  lunchCheckOutAt: string | null;
  lunchCheckInAt: string | null;
  teaCheckOutAt?: string | null;
  teaCheckInAt?: string | null;
  lunchBreakSegments?: BreakSegment[] | null;
  teaBreakSegments?: BreakSegment[] | null;
  lunchBreakStartedAt?: string | null;
  teaBreakStartedAt?: string | null;
  checkOutAt: string | null;
  totalHours: number | null;
  lunchBreakMinutes: number;
  teaBreakMinutes: number;
  idleLunchMinutes?: number | null;
  idleTeaMinutes?: number | null;
  idleMinutes?: number | null;
  lunchBreakOpen: boolean;
  teaBreakOpen: boolean;
  status: string | null;
  grossMinutes: number | null;
  activeMinutes: number | null;
  meetsEightHourWork: boolean;
  inOffice?: boolean;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  notes?: string | null;
  screenshotCount?: number | null;
  isOfficeLeave?: boolean;
  officeLeaveAttachmentUrl?: string | null;
};

type ScreenshotsTarget = {
  logId: string;
  employeeName: string | null;
  workDate: string | null;
};

function formatTimeTz(iso: string | null | undefined, tz: AttendanceTimeZoneId): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatOutInSpan(
  outIso: string | null | undefined,
  inIso: string | null | undefined,
  tz: AttendanceTimeZoneId,
): string {
  return `${formatTimeTz(outIso ?? null, tz)} – ${formatTimeTz(inIso ?? null, tz)}`;
}

/** Compact duration for break lines (e.g. 7m, 1h 22m). */
function fmtBreakDuration(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function BreakRangeWithDuration({
  outIso,
  inIso,
  tz,
}: {
  outIso: string | null | undefined;
  inIso: string | null | undefined;
  tz: AttendanceTimeZoneId;
}) {
  const mins =
    outIso && inIso ? minutesBetween(String(outIso), String(inIso)) : 0;
  return (
    <>
      {formatOutInSpan(outIso, inIso, tz)}
      {outIso && inIso ? (
        <span className="text-slate-500"> · {fmtBreakDuration(mins)}</span>
      ) : null}
    </>
  );
}

function BreakPunchesBlock({
  r,
  tz,
  className,
}: {
  r: Row;
  tz: AttendanceTimeZoneId;
  className?: string;
}) {
  if (r.isOfficeLeave) {
    return <span className="text-xs font-medium text-sky-800">Office Leave</span>;
  }

  const lunchSegs = r.lunchBreakSegments ?? [];
  const teaSegs = r.teaBreakSegments ?? [];
  const nodes: ReactNode[] = [];

  if (r.lunchBreakOpen && r.lunchBreakStartedAt) {
    nodes.push(
      <div key="l-open" className="tabular-nums text-amber-900">
        <span className="text-slate-500">Lunch (open): </span>
        {formatTimeTz(r.lunchBreakStartedAt, tz)} → …
      </div>,
    );
  } else if (lunchSegs.length > 0) {
    lunchSegs.forEach((seg, i) => {
      const label = lunchSegs.length > 1 ? `Lunch ${i + 1}` : "Lunch";
      nodes.push(
        <div key={`l-${i}`} className="tabular-nums text-slate-800">
          <span className="text-slate-500">{label}: </span>
          <BreakRangeWithDuration outIso={seg.out} inIso={seg.in} tz={tz} />
        </div>,
      );
    });
  } else if (r.lunchCheckOutAt || r.lunchCheckInAt) {
    nodes.push(
      <div key="l-leg" className="tabular-nums text-slate-800">
        <span className="text-slate-500">Lunch: </span>
        <BreakRangeWithDuration outIso={r.lunchCheckOutAt} inIso={r.lunchCheckInAt} tz={tz} />
      </div>,
    );
  }

  if (r.teaBreakOpen && r.teaBreakStartedAt) {
    nodes.push(
      <div key="t-open" className="tabular-nums text-amber-900">
        <span className="text-slate-500">Tea (open): </span>
        {formatTimeTz(r.teaBreakStartedAt, tz)} → …
      </div>,
    );
  } else if (teaSegs.length > 0) {
    teaSegs.forEach((seg, i) => {
      const label = teaSegs.length > 1 ? `Tea ${i + 1}` : "Tea";
      nodes.push(
        <div key={`t-${i}`} className="tabular-nums text-slate-800">
          <span className="text-slate-500">{label}: </span>
          <BreakRangeWithDuration outIso={seg.out} inIso={seg.in} tz={tz} />
        </div>,
      );
    });
  } else if (r.teaCheckOutAt || r.teaCheckInAt) {
    nodes.push(
      <div key="t-leg" className="tabular-nums text-slate-800">
        <span className="text-slate-500">Tea: </span>
        <BreakRangeWithDuration outIso={r.teaCheckOutAt} inIso={r.teaCheckInAt} tz={tz} />
      </div>,
    );
  }

  if (nodes.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return <div className={className ?? "space-y-1 text-xs"}>{nodes}</div>;
}

function fmtHoursMin(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function formatDayHeading(ymd: string): string {
  // Keep it consistent dd-mm-yyyy (no locale variations)
  return fmtDmy(ymd);
}

function formatShortYmd(ymd: string): string {
  return fmtDmy(ymd);
}

function AttendanceRow({
  r,
  showDateCol,
  showEmployeeCols,
  showScreenshotsCol,
  tz,
  onOpenScreenshots,
}: {
  r: Row;
  showDateCol: boolean;
  showEmployeeCols: boolean;
  showScreenshotsCol: boolean;
  tz: AttendanceTimeZoneId;
  onOpenScreenshots?: (target: ScreenshotsTarget) => void;
}) {
  const idleLunch = r.idleLunchMinutes ?? r.lunchBreakMinutes ?? 0;
  const idleTea = r.idleTeaMinutes ?? r.teaBreakMinutes ?? 0;
  const idleTotal = r.idleMinutes ?? (r.grossMinutes != null ? Math.max(0, idleLunch + idleTea) : null);
  return (
    <tr className="group">
      {showDateCol && (
        <td className="bg-white whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-600 group-hover:bg-[var(--primary-soft)]/40">
          {formatShortYmd(r.workDate)}
        </td>
      )}
      {showEmployeeCols && (
        <td className="bg-white px-4 py-3 group-hover:bg-[var(--primary-soft)]/40">
          <div className="font-medium text-slate-900">{r.employeeName || "—"}</div>
          <div className="text-xs text-slate-500">{r.employeeEmail}</div>
        </td>
      )}
      <td className="bg-white px-3 py-3 tabular-nums text-slate-800 group-hover:bg-[var(--primary-soft)]/40">
        {r.isOfficeLeave ? "—" : formatTimeTz(r.checkInAt, tz)}
      </td>
      <td
        className="bg-white min-w-[200px] max-w-[280px] px-3 py-3 group-hover:bg-[var(--primary-soft)]/40"
        title="Each line is one break window (out → in) with duration. Multiple lunch/tea periods appear separately when stored as segments."
      >
        <BreakPunchesBlock r={r} tz={tz} />
      </td>
      <td className="bg-white px-3 py-3 tabular-nums text-slate-800 group-hover:bg-[var(--primary-soft)]/40">
        {r.isOfficeLeave ? "—" : formatTimeTz(r.checkOutAt, tz)}
      </td>
      <td className="bg-white px-3 py-3 font-medium text-slate-800 group-hover:bg-[var(--primary-soft)]/40">
        {fmtHoursMin(r.grossMinutes)}
      </td>
      <td className="bg-white px-3 py-3 font-medium text-slate-800 group-hover:bg-[var(--primary-soft)]/40">
        {fmtHoursMin(r.activeMinutes)}
      </td>
      <td className="bg-white px-3 py-3 text-xs text-slate-600 group-hover:bg-[var(--primary-soft)]/40">
        {fmtHoursMin(idleLunch)} / {fmtHoursMin(idleTea)}
      </td>
      <td className="bg-white px-3 py-3 text-xs text-slate-600 group-hover:bg-[var(--primary-soft)]/40">
        {fmtHoursMin(idleTotal)}
      </td>
      <td className="bg-white px-3 py-3 group-hover:bg-[var(--primary-soft)]/40">
        {r.isOfficeLeave || r.checkOutAt ? (
          r.meetsEightHourWork ? (
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Yes
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">No</span>
          )
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="bg-white px-3 py-3 group-hover:bg-[var(--primary-soft)]/40">
        {r.isOfficeLeave ? (
          <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
            Office Leave
          </span>
        ) : r.inOffice ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Inside
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            Outside
          </span>
        )}
      </td>
      <td className="bg-white max-w-[320px] px-3 py-3 text-xs group-hover:bg-[var(--primary-soft)]/40">
        {r.notes ? (
          <span
            className={`line-clamp-3 ${notesIndicateAutoPunchOut(r.notes) ? "font-semibold text-red-600" : "text-slate-600"}`}
          >
            {r.notes}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
        {r.officeLeaveAttachmentUrl ? (
          <a
            href={r.officeLeaveAttachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] font-medium text-[var(--primary)] hover:underline"
          >
            View attachment
          </a>
        ) : null}
      </td>
      {showScreenshotsCol && (
        <td className="bg-white px-3 py-3 group-hover:bg-[var(--primary-soft)]/40">
          {r.screenshotCount && r.screenshotCount > 0 ? (
            <button
              type="button"
              onClick={() =>
                onOpenScreenshots?.({
                  logId: r.logId,
                  employeeName: r.employeeName ?? r.employeeEmail,
                  workDate: r.workDate,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 bg-[var(--primary-soft)]/60 px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
              title={`View ${r.screenshotCount} activity screenshot${r.screenshotCount === 1 ? "" : "s"}`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              View ({r.screenshotCount})
            </button>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
      )}
    </tr>
  );
}

function AttendanceMobileCard({
  r,
  showEmployeeCols,
  showDateLine,
  showScreenshots,
  tz,
  onOpenScreenshots,
}: {
  r: Row;
  showEmployeeCols: boolean;
  showDateLine: boolean;
  showScreenshots: boolean;
  tz: AttendanceTimeZoneId;
  onOpenScreenshots?: (target: ScreenshotsTarget) => void;
}) {
  const idleLunch = r.idleLunchMinutes ?? r.lunchBreakMinutes ?? 0;
  const idleTea = r.idleTeaMinutes ?? r.teaBreakMinutes ?? 0;
  const idleTotal = r.idleMinutes ?? (r.grossMinutes != null ? Math.max(0, idleLunch + idleTea) : null);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {showDateLine && (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">{formatShortYmd(r.workDate)}</p>
      )}
      {showEmployeeCols && (
        <div className={showDateLine ? "mt-2" : ""}>
          <p className="font-medium text-slate-900">{r.employeeName || "—"}</p>
          <p className="text-xs text-slate-500 break-all">{r.employeeEmail}</p>
        </div>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">1. First in</dt>
          <dd className="tabular-nums font-medium text-slate-800">
            {r.isOfficeLeave ? "—" : formatTimeTz(r.checkInAt, tz)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">2. Final out</dt>
          <dd className="tabular-nums font-medium text-slate-800">
            {r.isOfficeLeave ? "—" : formatTimeTz(r.checkOutAt, tz)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Break punches (lunch &amp; tea)</dt>
          <dd className="text-slate-800">
            <BreakPunchesBlock r={r} tz={tz} className="space-y-1 text-xs" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gross</dt>
          <dd className="font-medium text-slate-800">{fmtHoursMin(r.grossMinutes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Active</dt>
          <dd className="font-medium text-slate-800">{fmtHoursMin(r.activeMinutes)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Idle lunch / tea</dt>
          <dd className="text-slate-800">
            {fmtHoursMin(idleLunch)} / {fmtHoursMin(idleTea)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Total idle</dt>
          <dd className="text-xs text-slate-600">{fmtHoursMin(idleTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">≥8h</dt>
          <dd>
            {r.isOfficeLeave || r.checkOutAt ? (
              r.meetsEightHourWork ? (
                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Yes
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">No</span>
              )
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>
      {showScreenshots && r.screenshotCount && r.screenshotCount > 0 ? (
        <button
          type="button"
          onClick={() =>
            onOpenScreenshots?.({
              logId: r.logId,
              employeeName: r.employeeName ?? r.employeeEmail,
              workDate: r.workDate,
            })
          }
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 bg-[var(--primary-soft)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          View screenshots ({r.screenshotCount})
        </button>
      ) : null}
    </div>
  );
}

export default function AttendancePage() {
  const { role } = useHrmsSession();
  const isManagerial = role === "super_admin" || role === "admin" || role === "hr";

  const [screenshotsTarget, setScreenshotsTarget] = useState<ScreenshotsTarget | null>(null);
  const openScreenshots = useCallback((target: ScreenshotsTarget) => {
    setScreenshotsTarget(target);
  }, []);

  const [viewTz, setViewTz] = useState<AttendanceTimeZoneId>(IST_TZ);
  const [startDate, setStartDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  );
  const [preset, setPreset] = useState<AttendancePreset>("today");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasEmployee, setHasEmployee] = useState(true);
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = useResponsivePageSize();
  /** HRMS_users.id; empty = all employees (managerial only). */
  const [employeeFilterUserId, setEmployeeFilterUserId] = useState("");
  const [managerEmployees, setManagerEmployees] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  useEffect(() => {
    if (!isManagerial) {
      setManagerEmployees([]);
      setEmployeeFilterUserId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setEmployeesLoading(true);
      try {
        const res = await fetch("/api/employees");
        const data = await res.json();
        if (!cancelled && res.ok) {
          const raw = data.employees ?? [];
          const current = raw.filter((e: { employmentStatus?: string }) => e.employmentStatus === "current");
          setManagerEmployees(
            current.map((e: { id: string; name: string | null; email: string }) => ({
              id: e.id,
              name: e.name,
              email: e.email,
            })),
          );
        } else if (!cancelled) {
          setManagerEmployees([]);
        }
      } finally {
        if (!cancelled) setEmployeesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isManagerial]);

  const loadSeq = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbort.current?.abort();
    const ac = new AbortController();
    loadAbort.current = ac;
    const seq = ++loadSeq.current;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      if (isManagerial && employeeFilterUserId) {
        params.set("userId", employeeFilterUserId);
      }
      if (isManagerial && !employeeFilterUserId) {
        params.set("shiftKind", viewTz === US_EASTERN_TZ ? "night" : "day");
      }
      const url = isManagerial
        ? `/api/attendance/company?${params.toString()}`
        : `/api/attendance/me?${params.toString()}`;
      const res = await fetch(url, { signal: ac.signal });
      const data = await res.json();
      if (ac.signal.aborted || seq !== loadSeq.current) return;
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      const nextRows: Row[] = data.rows ?? [];
      if (process.env.NODE_ENV === "development" && isManagerial) {
        for (const r of nextRows) {
          console.debug("[Company Attendance]", {
            employeeName: r.employeeName,
            employee_id: r.employeeId,
            attendance_log_id: r.logId,
            screenshot_count: r.screenshotCount ?? 0,
            active_minutes: r.activeMinutes,
            note: "URL source (file_url/storage_path/file_path) resolved in screenshot viewer",
          });
        }
      }
      setRows(nextRows);
      setHasEmployee(data.hasEmployee !== false);
      if (!isManagerial && data?.timeZone) {
        setViewTz((data.timeZone as AttendanceTimeZoneId) || IST_TZ);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (ac.signal.aborted || seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      if (!ac.signal.aborted && seq === loadSeq.current) {
        setLoading(false);
      }
    }
  }, [isManagerial, startDate, endDate, employeeFilterUserId, viewTz]);

  useEffect(() => {
    void load();
  }, [load]);

  // When admin toggles timezone, switch the calendar presets to that timezone
  // so "Today/This week/This month" matches the selected view.
  useEffect(() => {
    if (!isManagerial) return;
    const ymd = todayYmdTz(viewTz === US_EASTERN_TZ ? "America/New_York" : "Asia/Kolkata");
    setStartDate(ymd);
    setEndDate(ymd);
    setPreset("today");
  }, [isManagerial, viewTz]);

  const showDateCol = startDate !== endDate;
  const showEmployeeCols = isManagerial && !employeeFilterUserId;
  /** Activity screenshots are sensitive — only managerial roles see the trigger column. */
  const showScreenshotsCol = isManagerial;

  const grouped = useMemo(() => {
    if (!showDateCol) return null;
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const d = String(r.workDate || "").slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, showDateCol]);

  const orderedRows = useMemo(() => {
    if (!showDateCol) return rows;
    if (!grouped) return rows;
    return grouped.flatMap(([, dayRows]) => dayRows);
  }, [rows, showDateCol, grouped]);

  const pagedMobileRows = useMemo(() => {
    const start = (mobilePage - 1) * mobilePageSize;
    return orderedRows.slice(start, start + mobilePageSize);
  }, [orderedRows, mobilePage, mobilePageSize]);

  useEffect(() => {
    setMobilePage(1);
  }, [startDate, endDate, employeeFilterUserId]);

  useEffect(() => {
    setMobilePage(1);
  }, [mobilePageSize]);

  const baseCols = (showEmployeeCols ? 10 : 9) + (showScreenshotsCol ? 1 : 0);
  const colCount = showDateCol ? baseCols + 1 : baseCols;

  const filteredEmployeeLabel = useMemo(() => {
    if (!employeeFilterUserId) return null;
    const e = managerEmployees.find((x) => x.id === employeeFilterUserId);
    return e?.name?.trim() || e?.email || "Selected employee";
  }, [employeeFilterUserId, managerEmployees]);

  const title = isManagerial
    ? filteredEmployeeLabel
      ? `Attendance — ${filteredEmployeeLabel}`
      : "Company attendance"
    : "My attendance";
  const description = isManagerial
    ? "Punch order: first in → break windows (lunch/tea, each out→in) → final out. When the app stores segment pairs, every break appears on its own line; otherwise lunch shows first out and last in only. Idle lunch/tea minutes drive active time. Present for payroll when active work is at least 8 hours."
    : `Your records for the selected period (${timeZoneLabel(viewTz)}). Same punch rules as on the dashboard. Use the Dashboard to punch in/out for today.`;

  return (
    <HrmsShellPage title={title} description={description}>
      <section className="space-y-6">
        {!hasEmployee ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">No employee profile linked</p>
            <p className="mt-1 text-sm text-amber-900/90">
              Your account is not linked to an employee record yet. Ask HR to complete your profile; then your attendance history will appear here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
                {isManagerial && (
                  <label className="flex min-w-[min(100%,12rem)] flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">View timezone</span>
                    <select
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      value={viewTz}
                      onChange={(e) => setViewTz(e.target.value as AttendanceTimeZoneId)}
                    >
                      <option value={IST_TZ}>IST (Asia/Kolkata)</option>
                      <option value={US_EASTERN_TZ}>US/Eastern (New York)</option>
                    </select>
                  </label>
                )}
                <AttendanceDateFilter
                  startDate={startDate}
                  endDate={endDate}
                  preset={preset}
                  timeZone={viewTz === US_EASTERN_TZ ? "America/New_York" : "Asia/Kolkata"}
                  onChange={(next) => {
                    setStartDate(next.startDate);
                    setEndDate(next.endDate);
                    setPreset(next.preset);
                  }}
                />
                {isManagerial && (
                  <label className="flex min-w-[min(100%,14rem)] flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Employee</span>
                    <select
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                      value={employeeFilterUserId}
                      onChange={(e) => setEmployeeFilterUserId(e.target.value)}
                      disabled={employeesLoading}
                    >
                      <option value="">{employeesLoading ? "Loading…" : "All employees"}</option>
                      {!employeesLoading &&
                        managerEmployees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name?.trim() || e.email}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition disabled:opacity-50 lg:self-auto"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>

          {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {orderedRows.length > mobilePageSize && !loading && (
            <div className="mb-4 md:hidden">
              <PaginationBar
                page={mobilePage}
                total={orderedRows.length}
                pageSize={mobilePageSize}
                loading={loading}
                onPageChange={setMobilePage}
              />
            </div>
          )}

          {loading ? (
            <SkeletonTable rows={6} columns={colCount} />
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <p className="text-sm font-semibold text-gray-700">No attendance records for this period.</p>
              <p className="mt-1 text-sm text-gray-600">
                {isManagerial
                  ? employeeFilterUserId
                    ? "No records for this employee in the selected period, or their profile may not be linked to an employee record."
                    : "Try another date range, pick a different employee, or refresh after employees punch."
                  : "Try another date range, or punch in from the Dashboard for today."}
              </p>
            </div>
          ) : (
            <>
            <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-[var(--primary-soft)]/40">
                    <tr className="border-b border-gray-200">
                      {showDateCol && (
                        <th className="w-[120px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          Date
                        </th>
                      )}
                      {showEmployeeCols && (
                        <th className="min-w-[220px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          Employee
                        </th>
                      )}
                      <th className="w-[120px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        1. First in
                      </th>
                      <th
                        className="min-w-[200px] max-w-[280px] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700"
                        title="Each line is one break window (out → in) with duration. Multiple lunch/tea periods appear separately when stored as segments. Without segments, lunch shows first out and last in only."
                      >
                        2. Break punches
                        <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-gray-500">
                          (lunch &amp; tea)
                        </span>
                      </th>
                      <th className="w-[120px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        3. Final out
                      </th>
                      <th className="w-[110px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Gross
                      </th>
                      <th className="w-[110px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Active
                      </th>
                      <th className="w-[130px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Lunch / Tea
                      </th>
                      <th className="w-[120px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Total idle
                      </th>
                      <th className="w-[80px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        ≥8h
                      </th>
                      <th className="w-[90px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Office
                      </th>
                      <th className="min-w-[220px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Notes
                      </th>
                      {showScreenshotsCol && (
                        <th className="w-[140px] whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          Screenshots
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!showDateCol &&
                      rows.map((r) => (
                        <AttendanceRow
                          key={r.logId}
                          r={r}
                          showDateCol={false}
                          showEmployeeCols={showEmployeeCols}
                          showScreenshotsCol={showScreenshotsCol}
                          tz={viewTz}
                          onOpenScreenshots={openScreenshots}
                        />
                      ))}
                    {showDateCol &&
                      orderedRows.map((r) => (
                        <AttendanceRow
                          key={r.logId}
                          r={r}
                          showDateCol={true}
                          showEmployeeCols={showEmployeeCols}
                          showScreenshotsCol={showScreenshotsCol}
                          tz={viewTz}
                          onOpenScreenshots={openScreenshots}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 lg:hidden">
              {pagedMobileRows.map((r) => (
                <Fragment key={r.logId}>
                  <AttendanceMobileCard
                    r={r}
                    showEmployeeCols={showEmployeeCols}
                    showDateLine={showDateCol ? true : !showDateCol}
                    showScreenshots={showScreenshotsCol}
                    tz={viewTz}
                    onOpenScreenshots={openScreenshots}
                  />
                </Fragment>
              ))}
            </div>
            </>
          )}
        </div>
      )}
      </section>
      {showScreenshotsCol && (
        <AttendanceScreenshotsDialog
          open={!!screenshotsTarget}
          onClose={() => setScreenshotsTarget(null)}
          logId={screenshotsTarget?.logId ?? null}
          employeeName={screenshotsTarget?.employeeName ?? null}
          workDate={screenshotsTarget?.workDate ? fmtDmy(screenshotsTarget.workDate) : null}
        />
      )}
    </HrmsShellPage>
  );
}
