"use client";

import { useHrmsSession } from "@/hooks/useHrmsSession";
import { AttendanceDateFilter, type AttendancePreset } from "@/components/attendance/AttendanceDateFilter";
import { PaginationBar } from "@/components/common/PaginationBar";
import { SkeletonTable } from "@/components/common/Skeleton";
import { HrmsShellPage } from "@/components/layout/HrmsShellPage";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fmtDmy } from "@/lib/dateFormat";

type Row = {
  logId: string;
  workDate: string;
  employeeId: string;
  employeeName: string | null;
  employeeEmail: string;
  checkInAt: string | null;
  lunchCheckOutAt: string | null;
  lunchCheckInAt: string | null;
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
};

function formatTimeIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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
}: {
  r: Row;
  showDateCol: boolean;
  showEmployeeCols: boolean;
}) {
  const idleLunch = r.idleLunchMinutes ?? r.lunchBreakMinutes ?? 0;
  const idleTea = r.idleTeaMinutes ?? r.teaBreakMinutes ?? 0;
  const idleTotal = r.idleMinutes ?? (r.grossMinutes != null ? Math.max(0, idleLunch + idleTea) : null);
  return (
    <tr className="bg-white transition-colors hover:bg-[var(--primary-soft)]/40">
      {showDateCol && (
        <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-600">{formatShortYmd(r.workDate)}</td>
      )}
      {showEmployeeCols && (
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{r.employeeName || "—"}</div>
          <div className="text-xs text-slate-500">{r.employeeEmail}</div>
        </td>
      )}
      <td className="px-3 py-3 tabular-nums text-slate-800">{formatTimeIST(r.checkInAt)}</td>
      <td className="px-3 py-3 tabular-nums text-slate-800">{formatTimeIST(r.lunchCheckOutAt)}</td>
      <td className="px-3 py-3 tabular-nums text-slate-800">{formatTimeIST(r.lunchCheckInAt)}</td>
      <td className="px-3 py-3 tabular-nums text-slate-800">{formatTimeIST(r.checkOutAt)}</td>
      <td className="px-3 py-3 font-medium text-slate-800">{fmtHoursMin(r.grossMinutes)}</td>
      <td className="px-3 py-3 font-medium text-slate-800">{fmtHoursMin(r.activeMinutes)}</td>
      <td className="px-3 py-3 text-xs text-slate-600">
        {fmtHoursMin(idleLunch)} / {fmtHoursMin(idleTea)}
      </td>
      <td className="px-3 py-3 text-xs text-slate-600">
        {fmtHoursMin(idleTotal)}
      </td>
      <td className="px-3 py-3">
        {r.checkOutAt ? (
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
      <td className="px-3 py-3">
        {r.inOffice ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Inside
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            Outside
          </span>
        )}
      </td>
      <td className="max-w-[320px] px-3 py-3 text-xs text-slate-600">
        {r.notes ? <span className="line-clamp-2">{r.notes}</span> : <span className="text-slate-400">—</span>}
      </td>
    </tr>
  );
}

function AttendanceMobileCard({
  r,
  showEmployeeCols,
  showDateLine,
}: {
  r: Row;
  showEmployeeCols: boolean;
  showDateLine: boolean;
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
          <dd className="tabular-nums font-medium text-slate-800">{formatTimeIST(r.checkInAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">2. Lunch out</dt>
          <dd className="tabular-nums font-medium text-slate-800">{formatTimeIST(r.lunchCheckOutAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">3. Lunch in</dt>
          <dd className="tabular-nums font-medium text-slate-800">{formatTimeIST(r.lunchCheckInAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">4. Final out</dt>
          <dd className="tabular-nums font-medium text-slate-800">{formatTimeIST(r.checkOutAt)}</dd>
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
            {r.checkOutAt ? (
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
    </div>
  );
}

export default function AttendancePage() {
  const { role } = useHrmsSession();
  const isManagerial = role === "super_admin" || role === "admin" || role === "hr";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      const url = isManagerial
        ? `/api/attendance/company?${params.toString()}`
        : `/api/attendance/me?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setRows(data.rows ?? []);
      setHasEmployee(data.hasEmployee !== false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isManagerial, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const showDateCol = startDate !== endDate;
  const showEmployeeCols = isManagerial;

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
  }, [startDate, endDate]);

  useEffect(() => {
    setMobilePage(1);
  }, [mobilePageSize]);

  const baseCols = showEmployeeCols ? 11 : 10;
  const colCount = showDateCol ? baseCols + 1 : baseCols;

  const title = isManagerial ? "Company attendance" : "My attendance";
  const description = isManagerial
    ? "Punch sequence: first check in → lunch out → lunch in → final check out. If lunch punches are missing, a mandatory 1 hour lunch is applied for that day (stored on final check out when possible). Active time = gross minus lunch (effective) and tea. Present for payroll when active work is at least 8 hours. Dates use the IST calendar."
    : "Your records for the selected period (IST). Same punch rules as on the dashboard. Use the Dashboard to punch in/out for today.";

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
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <AttendanceDateFilter
                startDate={startDate}
                endDate={endDate}
                preset={preset}
                onChange={(next) => {
                  setStartDate(next.startDate);
                  setEndDate(next.endDate);
                  setPreset(next.preset);
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition disabled:opacity-50"
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
                {isManagerial ? "Try another date range or refresh after employees punch." : "Try another date range, or punch in from the Dashboard for today."}
              </p>
            </div>
          ) : (
            <>
            <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-[var(--primary-soft)]/40">
                      {showDateCol && (
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          Date
                        </th>
                      )}
                      {showEmployeeCols && (
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                          Employee
                        </th>
                      )}
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        1. First in
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        2. Lunch out
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        3. Lunch in
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        4. Final out
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Gross
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Active
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Lunch / Tea
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Total idle
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        ≥8h
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Office
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {!showDateCol &&
                      rows.map((r) => (
                        <AttendanceRow key={r.logId} r={r} showDateCol={false} showEmployeeCols={showEmployeeCols} />
                      ))}
                    {showDateCol &&
                      grouped?.map(([date, dayRows]) => (
                        <Fragment key={date}>
                          <tr className="bg-slate-100/90">
                            <td
                              colSpan={colCount}
                              className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
                            >
                              {formatDayHeading(date)}
                            </td>
                          </tr>
                          {dayRows.map((r) => (
                            <AttendanceRow key={r.logId} r={r} showDateCol={true} showEmployeeCols={showEmployeeCols} />
                          ))}
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {pagedMobileRows.map((r, i) => (
                <Fragment key={r.logId}>
                  {showDateCol &&
                    (i === 0 ||
                      String(pagedMobileRows[i - 1]?.workDate).slice(0, 10) !== String(r.workDate).slice(0, 10)) && (
                    <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {formatDayHeading(String(r.workDate).slice(0, 10))}
                    </p>
                  )}
                  <AttendanceMobileCard
                    r={r}
                    showEmployeeCols={showEmployeeCols}
                    showDateLine={!showDateCol}
                  />
                </Fragment>
              ))}
            </div>
            </>
          )}
        </div>
      )}
    </section>
    </HrmsShellPage>
  );
}
