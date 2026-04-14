"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useHrmsSession } from "@/hooks/useHrmsSession";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/ToastProvider";

const PRIMARY = "var(--primary)";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

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

type AttendanceLog = {
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
  status: string | null;
};

/** Display ms as H:MM:SS or M:SS for live counters */
function formatDurationMs(ms: number): string {
  const x = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = x % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function AvatarUrl({ userId, gender }: { userId: string; gender: string | null }) {
  const seed = encodeURIComponent(userId);
  const base = `https://api.dicebear.com/9.x/personas/svg?seed=${seed}&backgroundColor=0d9488`;
  if (gender === "female") {
    return `${base}&hair=bobCut,long,pigtails,curlyBun,straightBun,bobBangs&facialHairProbability=0`;
  }
  return `${base}&hair=bald,buzzcut,shortCombover,fade,mohawk,balding&facialHairProbability=50`;
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className ?? ""}`} />;
}

export function DashboardContent() {
  const { role, name, id } = useHrmsSession();
  const { showToast } = useToast();
  const [user, setUser] = useState<{ gender: string | null } | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<{ leaveTypeName: string; used: number; remaining: number | null; isPaid: boolean }[]>([]);
  const [payslips, setPayslips] = useState<{ periodFormatted: string; generatedAt: string; payDays: number | null }[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<
    { id: string; name: string; holiday_date: string; holiday_end_date: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<null | { title: string; message: string; confirmText?: string }>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const confirmResolveRef = useState<{ fn: ((v: boolean) => void) | null }>({ fn: null })[0];
  const [attendance, setAttendance] = useState<{
    hasEmployee: boolean;
    workDate: string;
    log: AttendanceLog | null;
  } | null>(null);

  function confirmAction(args: { title: string; message: string; confirmText?: string }): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolveRef.fn = resolve;
      setConfirmState({ title: args.title, message: args.message, confirmText: args.confirmText });
    });
  }

  function closeConfirm(result: boolean) {
    const fn = confirmResolveRef.fn;
    confirmResolveRef.fn = null;
    setConfirmState(null);
    setConfirmLoading(false);
    fn?.(result);
  }
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  /** Drives live HH:MM:SS / counters while punched in */
  const [tick, setTick] = useState(() => Date.now());

  async function refreshAttendance() {
    const res = await fetch("/api/attendance");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAttendance(null);
      return;
    }
    setAttendance({
      hasEmployee: data.hasEmployee === true,
      workDate: String(data.workDate ?? ""),
      log: (data.log as AttendanceLog) ?? null,
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balanceRes, payslipRes, holidaysRes, attRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/leave/balance"),
          fetch("/api/payslips/me"),
          fetch("/api/holidays"),
          fetch("/api/attendance"),
        ]);
        if (!cancelled && meRes.ok) {
          const d = await meRes.json();
          setUser(d.user ?? null);
        }
        if (!cancelled && balanceRes.ok) {
          const d = await balanceRes.json();
          const balances = (d.balances ?? []).slice(0, 3).map((b: any) => ({
            leaveTypeName: b.leaveTypeName,
            used: b.used ?? 0,
            remaining: b.remaining != null ? b.remaining : null,
            isPaid: b.isPaid ?? true,
          }));
          setLeaveBalances(balances);
        }
        if (!cancelled && payslipRes.ok) {
          const d = await payslipRes.json();
          setPayslips((d.payslips ?? []).slice(0, 1));
        }
        if (!cancelled && holidaysRes.ok) {
          const d = await holidaysRes.json();
          const today = new Date().toISOString().slice(0, 10);
          const upcoming = (d.holidays ?? [])
            .filter((h: any) => {
              const last = String(h.holiday_end_date ?? h.holiday_date).slice(0, 10);
              return last >= today;
            })
            .sort((a: any, b: any) => String(a.holiday_date).localeCompare(String(b.holiday_date)))
            .slice(0, 5)
            .map((h: any) => ({
              id: String(h.id ?? ""),
              name: h.name ?? "",
              holiday_date: String(h.holiday_date).slice(0, 10),
              holiday_end_date: h.holiday_end_date ? String(h.holiday_end_date).slice(0, 10) : null,
            }));
          setUpcomingHolidays(upcoming);
        }
        if (!cancelled && attRes.ok) {
          const d = await attRes.json();
          setAttendance({
            hasEmployee: d.hasEmployee === true,
            workDate: String(d.workDate ?? ""),
            log: (d.log as AttendanceLog) ?? null,
          });
        } else if (!cancelled) {
          setAttendance(null);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAttendanceLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** 1s clock while punched in (for live elapsed + break counters) */
  useEffect(() => {
    const log = attendance?.log;
    if (!log?.check_in_at || log?.check_out_at) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attendance?.log]);

  async function handleBreakToggle(kind: "lunch" | "tea") {
    const isLunch = kind === "lunch";
    const running = isLunch ? !!attendance?.log?.lunch_break_started_at : !!attendance?.log?.tea_break_started_at;
    const ok = await confirmAction({
      title: isLunch ? (running ? "End lunch break?" : "Start lunch break?") : running ? "End tea break?" : "Start tea break?",
      message: isLunch
        ? running
          ? "This will mark Lunch In now."
          : "This will mark Lunch Out now."
        : running
          ? "This will end tea break now."
          : "This will start tea break now.",
      confirmText: running ? "Confirm" : "Confirm",
    });
    if (!ok) return;
    setPunching(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "break", kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Request failed");
      if (data.log) {
        setAttendance((prev) => (prev ? { ...prev, log: data.log as AttendanceLog } : null));
      } else {
        await refreshAttendance();
      }
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setPunching(false);
    }
  }

  async function handleAttendancePunch(action: "in" | "out", opts?: { allowRepunchOut?: boolean }) {
    const ok = await confirmAction(
      action === "in"
        ? { title: "Punch in now?", message: "This will start your workday timer.", confirmText: "Punch in" }
        : { title: "Final punch out now?", message: "This will complete today's attendance.", confirmText: "Punch out" }
    );
    if (!ok) return;
    setPunching(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          allowRepunchOut: opts?.allowRepunchOut === true ? true : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Request failed");
      showToast("success", action === "in" ? "Punched in successfully" : "Punched out successfully");
      if (data.log) {
        setAttendance((prev) =>
          prev ? { ...prev, log: data.log as AttendanceLog } : null
        );
      } else {
        await refreshAttendance();
      }
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setPunching(false);
    }
  }

  const displayName = name || "Employee";
  const greeting = getGreeting();

  // Employee-focused dashboard (attractive layout from reference)
  if (role === "employee") {
    const lastPay = payslips[0];
    const lastPayDate = lastPay?.generatedAt
      ? new Date(lastPay.generatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

    const attLog = attendance?.log;
    const attDateLabel = attendance?.workDate
      ? new Date(attendance.workDate + "T12:00:00Z").toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

    const nowMs = tick;
    const punchedInOpen = !!(attLog?.check_in_at && !attLog?.check_out_at);
    const punchInMs = punchedInOpen && attLog?.check_in_at ? new Date(attLog.check_in_at).getTime() : 0;
    const lunchBaseMs = (Number(attLog?.lunch_break_minutes) || 0) * 60 * 1000;
    const teaBaseMs = (Number(attLog?.tea_break_minutes) || 0) * 60 * 1000;
    const lunchRunningSinceMs =
      punchedInOpen && attLog?.lunch_break_started_at ? new Date(attLog.lunch_break_started_at).getTime() : null;
    const teaRunningSinceMs =
      punchedInOpen && attLog?.tea_break_started_at ? new Date(attLog.tea_break_started_at).getTime() : null;
    const lunchTotalMs =
      punchedInOpen && lunchRunningSinceMs != null && Number.isFinite(lunchRunningSinceMs)
        ? lunchBaseMs + Math.max(0, nowMs - lunchRunningSinceMs)
        : lunchBaseMs;
    const teaTotalMs =
      punchedInOpen && teaRunningSinceMs != null && Number.isFinite(teaRunningSinceMs)
        ? teaBaseMs + Math.max(0, nowMs - teaRunningSinceMs)
        : teaBaseMs;
    const elapsedMs = punchInMs ? nowMs - punchInMs : 0;
    const activeMs = punchedInOpen ? Math.max(0, elapsedMs - lunchTotalMs - teaTotalMs) : 0;
    const activeMeetsPresent = activeMs >= 8 * 60 * 60 * 1000;
    const lunchRunning = punchedInOpen && !!attLog?.lunch_break_started_at;
    const teaRunning = punchedInOpen && !!attLog?.tea_break_started_at;

    return (
      <section className="min-h-[60vh]">
        <ConfirmDialog
          open={!!confirmState}
          title={confirmState?.title ?? ""}
          description={confirmState?.message}
          confirmText={confirmState?.confirmText ?? "Confirm"}
          loading={confirmLoading}
          onClose={() => closeConfirm(false)}
          onConfirm={() => closeConfirm(true)}
        />
        <div className="space-y-6">
          <PageHeader
            title="Dashboard"
            description="Today’s snapshot of attendance, leave, pay and holidays."
            right={
              <Link
                href="/app/profile"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                View profile
              </Link>
            }
          />
        {/* Top greeting banner */}
        <div className="mb-6 rounded-xl bg-[var(--primary)] px-4 py-4 text-center text-white sm:px-6">
          <h1 className="text-lg font-semibold sm:text-xl">
            {greeting} {displayName}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Profile + Leave summary */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-6 flex items-center gap-4">
                <Image
                  unoptimized
                  src={AvatarUrl({ userId: id, gender: user?.gender ?? null })}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-slate-200"
                />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{displayName}</h2>
                  <p className="text-sm text-slate-500">Employee</p>
                </div>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading leave balances">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <SkeletonBar className="h-10 w-10 shrink-0 rounded-lg" />
                          <SkeletonBar className="h-4 w-32" />
                        </div>
                        <SkeletonBar className="h-8 w-12" />
                      </div>
                    ))}
                  </div>
                ) : leaveBalances.length > 0 ? (
                  leaveBalances.map((b) => (
                    <div
                      key={b.leaveTypeName}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: "var(--primary-soft)" }}
                        >
                          {b.isPaid ? (
                            <svg className="h-5 w-5" style={{ color: PRIMARY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" style={{ color: PRIMARY }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: PRIMARY }}>
                            {b.leaveTypeName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: PRIMARY }}>
                          {b.remaining != null ? b.remaining : "∞"}
                        </p>
                        <p className="text-xs font-medium text-slate-500">Available</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-500">
                    No leave policies configured.
                  </div>
                )}
              </div>

              <Link
                href="/app/approvals?tab=leave"
                className="mt-4 block w-full rounded-lg bg-[var(--primary)] py-2.5 text-center text-sm font-semibold text-white transition hover:brightness-95"
              >
                Go to Leave module
              </Link>
            </div>
          </div>

          {/* Right: Attendance + My Pay + holidays */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-3 text-lg font-semibold text-white bg-[var(--primary)]">
                Today&apos;s attendance
              </div>
              <div className="p-6">
                {attendanceLoading ? (
                  <div className="flex gap-4" aria-busy="true" aria-label="Loading attendance">
                    <SkeletonBar className="h-12 flex-1 rounded-xl" />
                    <SkeletonBar className="h-12 flex-1 rounded-xl" />
                  </div>
                ) : !attendance?.hasEmployee ? (
                  <p className="text-sm text-slate-600">
                    Your account is not linked to an employee profile yet. Ask HR to complete your employee record, then you can punch in and out here.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">{attDateLabel}</p>
                    {attLog?.check_in_at && attLog?.check_out_at ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                          <p className="text-xs font-medium text-slate-500">1. First check in</p>
                          <p className="text-lg font-semibold text-slate-900">{formatTimeIST(attLog.check_in_at)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                          <p className="text-xs font-medium text-slate-500">4. Final check out</p>
                          <p className="text-lg font-semibold text-slate-900">{formatTimeIST(attLog.check_out_at)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                          <p className="text-xs font-medium text-slate-500">2. Lunch check out</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {formatTimeIST(attLog.lunch_check_out_at)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                          <p className="text-xs font-medium text-slate-500">3. Lunch check in</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {formatTimeIST(attLog.lunch_check_in_at)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 sm:col-span-2">
                          <p className="text-xs font-medium text-slate-500">Gross hours · Lunch · Tea (min)</p>
                          <p className="text-sm text-slate-800">
                            {attLog.total_hours != null ? `${Number(attLog.total_hours).toFixed(2)} h` : "—"}
                            <span className="text-slate-400"> · </span>
                            {attLog.lunch_break_minutes ?? 0}
                            <span className="text-slate-400"> · </span>
                            {attLog.tea_break_minutes ?? 0}
                          </p>
                          <p className="mt-1 text-sm text-slate-800">
                            <span className="text-xs font-medium text-slate-500">Active work hours: </span>
                            {(() => {
                              const grossMin = Math.round((Number(attLog.total_hours) || 0) * 60);
                              const breaks = (Number(attLog.lunch_break_minutes) || 0) + (Number(attLog.tea_break_minutes) || 0);
                              const activeMin = Math.max(0, grossMin - breaks);
                              return `${(activeMin / 60).toFixed(2)} h`;
                            })()}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            Target ~9h on premises including lunch; payroll counts present when active work (after breaks) is
                            at least 8 hours. If you skip lunch punches, 1 hour lunch is applied automatically when you check
                            out.
                          </p>
                          <div className="mt-3">
                            <p className="text-[11px] text-slate-500">
                              Today’s attendance is completed after final punch out. Contact HR/Admin if you need corrections.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : attLog?.check_in_at && !attLog?.check_out_at ? (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-4">
                          <p className="text-xs font-medium text-emerald-800">
                            Step 1 done — First check in at {formatTimeIST(attLog.check_in_at)}
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium text-emerald-700/90">Time on premises (since first in)</p>
                              <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-900">
                                {formatDurationMs(elapsedMs)}
                              </p>
                              <p className="mt-1 text-[11px] text-emerald-800/70">Typical full day ~9h including lunch</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-emerald-700/90">Active work (after breaks)</p>
                              <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-900">
                                {formatDurationMs(activeMs)}
                              </p>
                              <p className="mt-1 text-[11px] text-emerald-800/80">
                                {activeMeetsPresent ? (
                                  <span className="font-medium">≥ 8h active — present for payroll</span>
                                ) : (
                                  <span>Need 8h active work for payroll present</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
                          <li className="font-medium text-emerald-800">First check in — completed</li>
                          <li>
                            <span className="font-medium text-slate-800">Check out for lunch</span>
                            <span className="block text-xs font-normal text-slate-500">
                              Records lunch start; end lunch before final check out.
                            </span>
                            <button
                              type="button"
                              disabled={punching || lunchRunning}
                              onClick={() => handleBreakToggle("lunch")}
                              className="mt-2 w-full rounded-xl border-2 border-amber-200 bg-amber-50/80 px-4 py-3 text-center text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
                            >
                              {punching ? "Saving…" : "2. Check out for lunch"}
                            </button>
                          </li>
                          <li>
                            <span className="font-medium text-slate-800">Check in after lunch</span>
                            <span className="block text-xs font-normal text-slate-500">Return from lunch before leaving for the day.</span>
                            <button
                              type="button"
                              disabled={punching || !lunchRunning}
                              onClick={() => handleBreakToggle("lunch")}
                              className="mt-2 w-full rounded-xl border-2 border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
                            >
                              {punching ? "Saving…" : "3. Check in after lunch"}
                            </button>
                          </li>
                          <li>
                            <span className="font-medium text-slate-800">Final check out</span>
                            <span className="block text-xs font-normal text-slate-500">
                              Ends the day; close lunch first if still on break.
                            </span>
                          </li>
                        </ol>

                        <details className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                          <summary className="cursor-pointer font-medium text-slate-700">Optional: tea break</summary>
                          <div
                            className={`mt-3 rounded-xl border-2 px-4 py-3 ${
                              teaRunning ? "border-sky-400 bg-sky-50/80" : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-700">Tea</p>
                                <p className="mt-1 font-mono text-lg tabular-nums text-slate-900">
                                  {formatDurationMs(teaTotalMs)}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {teaRunning ? "On tea — tap to end" : "Separate from lunch flow"}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={punching}
                                onClick={() => handleBreakToggle("tea")}
                                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
                                  teaRunning
                                    ? "bg-sky-600 text-white hover:bg-sky-700"
                                    : "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100"
                                }`}
                              >
                                {teaRunning ? "End tea" : "Start tea"}
                              </button>
                            </div>
                          </div>
                        </details>

                        <button
                          type="button"
                          disabled={punching || lunchRunning || teaRunning}
                          onClick={() => handleAttendancePunch("out")}
                          title={
                            lunchRunning || teaRunning
                              ? "End lunch or tea before final check out"
                              : undefined
                          }
                          className="w-full rounded-xl border-2 border-slate-800 bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {punching ? "Saving…" : "4. Final check out (total hours)"}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">
                          Start with first check in, then lunch out → lunch in → final check out (~9h on site including lunch,
                          8h active for present).
                        </p>
                        <button
                          type="button"
                          disabled={punching}
                          onClick={() => handleAttendancePunch("in")}
                          className="w-full rounded-xl bg-[var(--primary)] px-4 py-4 text-center text-base font-semibold text-white shadow-md transition hover:brightness-95 disabled:opacity-50"
                        >
                          {punching ? "Saving…" : "1. First check in"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-3 text-lg font-semibold text-white bg-[var(--primary)]">
                My Pay
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-sm text-slate-600">Last Pay Period</span>
                    <span className="font-medium text-slate-900">
                      {lastPay?.periodFormatted || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <span className="text-sm text-slate-600">Last Pay Date</span>
                    <span className="font-medium text-slate-900">{lastPayDate}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">No. Of Pay Days</span>
                    <span className="font-medium text-slate-900">
                      {lastPay?.payDays != null ? lastPay.payDays : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Upcoming holidays</h3>
                <Link href="/app/holidays" className="text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition">
                  View all
                </Link>
              </div>
              {upcomingHolidays.length > 0 ? (
                <ul className="space-y-3">
                  {upcomingHolidays.map((h) => {
                    const fmtYmd = (ymd: string) => {
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
                      if (!m) return ymd;
                      const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
                      return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                    };
                    const end = h.holiday_end_date;
                    const fmt =
                      end && end !== h.holiday_date
                        ? `${fmtYmd(h.holiday_date)} – ${fmtYmd(end)}`
                        : fmtYmd(h.holiday_date);
                    return (
                      <li
                        key={h.id || h.holiday_date + (end ?? "")}
                        className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-sm font-medium text-slate-900">{h.name}</span>
                        <span className="text-sm text-slate-600">{fmt}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No upcoming holidays.</p>
              )}
            </div>
          </div>
        </div>
        </div>
      </section>
    );
  }

  // Managerial / Admin dashboard (cleaner card layout, teal accents)
  return (
    <section className="space-y-4">
      <PageHeader title="Dashboard" description={`You are viewing the ${role.replaceAll("_", " ")} workflow.`} />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6">
        <div className="text-sm text-gray-600">{greeting}</div>
        <div className="mt-1 text-xl font-bold text-gray-900">{displayName}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(role === "super_admin" || role === "admin" || role === "hr" || role === "manager") && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Attendance overview</h3>
            <p className="text-sm text-gray-600">
              Employees punch: first in → lunch out → lunch in → final out. Super Admin / Admin / HR can review everyone&apos;s
              punches by date.
            </p>
            {(role === "super_admin" || role === "admin" || role === "hr") && (
              <Link
                href="/app/attendance"
                className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition"
              >
                Company attendance
              </Link>
            )}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Leaves</h3>
          <p className="text-sm text-gray-600">
            See your current leave balance and recent requests. Managers and HR can see their team or company.
          </p>
          <Link
            href="/app/approvals?tab=leave"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition"
          >
            Go to Leave module
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Payroll & Payslips</h3>
          <p className="text-sm text-gray-600">
            View generated payslips for each payroll period. Admin / HR can run payroll per company.
          </p>
          <Link
            href="/app/profile?tab=pay"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition"
          >
            View my payslips
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Holidays</h3>
          <p className="text-sm text-gray-600">Company holiday calendar as configured by Admin / HR, visible to all employees.</p>
          <Link
            href="/app/holidays"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            View calendar
          </Link>
        </div>

        {(role === "super_admin" || role === "admin" || role === "hr") && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Employee Hub</h3>
            <p className="text-sm text-gray-600">Search, view and manage employee records for the entire company.</p>
            <Link
              href="/app/employees"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition"
            >
              Go to Employees
            </Link>
          </div>
        )}

        {role === "super_admin" && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-6 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Companies</h3>
            <p className="text-sm text-gray-600">Register companies, configure their business details and onboard HR / Admin users.</p>
          </div>
        )}
      </div>
    </section>
  );
}
