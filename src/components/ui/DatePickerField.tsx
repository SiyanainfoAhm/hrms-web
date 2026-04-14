"use client";

import { dateToYmdIST, istTodayYmd, ymdToNoonIST } from "@/lib/istCalendar";
import { enIN } from "date-fns/locale/en-IN";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** First day of the Y-M-D calendar month (for dropdown navigation bounds). */
function ymdToMonthStart(ymd: string): Date {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function formatDdMmYyyy(ymd: string): string {
  if (!isYmd(ymd)) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

function addMonths(d: Date, delta: number): Date {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + delta);
  return x;
}

function overlapsRange(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd >= bStart && aStart <= bEnd;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export type DatePickerFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** Inclusive min date (YYYY-MM-DD) */
  min?: string;
  /** Inclusive max date (YYYY-MM-DD) */
  max?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholder?: string;
  /** Extra classes on the outer wrapper (e.g. w-full) */
  className?: string;
  /** Show Clear / Today in footer */
  showQuickActions?: boolean;
};

type PickerView = "days" | "months" | "years";

export function DatePickerField({
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  id,
  placeholder = "dd-mm-yyyy",
  className = "",
  showQuickActions = true,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<PickerView>("days");
  const [month, setMonth] = useState<Date>(() => ymdToNoonIST(istTodayYmd()));
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.max(r.width, 288);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    let top = r.bottom + 6;
    const estH = 400;
    if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 6);
    setCoords({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  const selected = value && isYmd(value) ? ymdToNoonIST(value) : undefined;

  const disabledMatcher = (date: Date) => {
    const ymd = dateToYmdIST(date);
    if (min && isYmd(min) && ymd < min) return true;
    if (max && isYmd(max) && ymd > max) return true;
    return false;
  };

  const { startMonth, endMonth, minYear, maxYear } = useMemo(() => {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear() - 120, 0, 1);
    const defaultEnd = new Date(now.getFullYear() + 10, 11, 1);
    let start = defaultStart;
    let end = defaultEnd;
    if (min && isYmd(min)) start = ymdToMonthStart(min);
    if (max && isYmd(max)) end = ymdToMonthStart(max);
    if (start > end) {
      return {
        startMonth: defaultStart,
        endMonth: defaultEnd,
        minYear: defaultStart.getFullYear(),
        maxYear: defaultEnd.getFullYear(),
      };
    }
    return { startMonth: start, endMonth: end, minYear: start.getFullYear(), maxYear: end.getFullYear() };
  }, [min, max]);

  useEffect(() => {
    if (!open) return;
    const m = value && isYmd(value) ? ymdToNoonIST(value) : ymdToNoonIST(istTodayYmd());
    setMonth(m);
    setView("days");
    const y = Math.min(Math.max(m.getFullYear(), minYear), maxYear);
    setYearPageStart(Math.floor(y / 12) * 12);
  }, [open, value, minYear, maxYear]);

  const canPrevMonth = monthKey(addMonths(month, -1)) >= monthKey(startMonth);
  const canNextMonth = monthKey(addMonths(month, 1)) <= monthKey(endMonth);

  const goPrevMonth = () => {
    if (!canPrevMonth) return;
    setMonth(addMonths(month, -1));
  };

  const goNextMonth = () => {
    if (!canNextMonth) return;
    setMonth(addMonths(month, 1));
  };

  const canPrevYearInMonthView = monthKey(new Date(month.getFullYear() - 1, month.getMonth(), 1)) >= monthKey(startMonth);
  const canNextYearInMonthView = monthKey(new Date(month.getFullYear() + 1, month.getMonth(), 1)) <= monthKey(endMonth);

  const goPrevYearMonthView = () => {
    if (!canPrevYearInMonthView) return;
    const next = new Date(month.getFullYear() - 1, month.getMonth(), 1);
    setMonth(monthKey(next) < monthKey(startMonth) ? startMonth : next);
  };

  const goNextYearMonthView = () => {
    if (!canNextYearInMonthView) return;
    const next = new Date(month.getFullYear() + 1, month.getMonth(), 1);
    setMonth(monthKey(next) > monthKey(endMonth) ? endMonth : next);
  };

  const yearPageEnd = yearPageStart + 11;
  const canPrevYearPage = overlapsRange(yearPageStart - 12, yearPageStart - 1, minYear, maxYear);
  const canNextYearPage = overlapsRange(yearPageStart + 12, yearPageStart + 23, minYear, maxYear);

  const yearDisabled = (y: number) => y < minYear || y > maxYear;

  const monthDisabled = (y: number, monthIndex: number) => {
    const first = new Date(y, monthIndex, 1);
    const last = new Date(y, monthIndex + 1, 0);
    if (monthKey(last) < monthKey(startMonth)) return true;
    if (monthKey(first) > monthKey(endMonth)) return true;
    return false;
  };

  const triggerClass =
    "flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm " +
    "focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 " +
    (disabled ? "cursor-not-allowed bg-slate-50 text-slate-500" : "text-slate-900 hover:border-slate-400");

  const navBtn =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

  const panel =
    typeof document !== "undefined" &&
    open &&
    coords &&
    createPortal(
      <div
        ref={panelRef}
        className="rdp-theme date-picker-panel fixed z-[9999] max-h-[min(460px,calc(100vh-16px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/40 ring-1 ring-slate-900/5"
        style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
        role="dialog"
        aria-label="Choose date"
      >
        <div className="mb-2 flex min-h-[2.25rem] items-center justify-between gap-2">
          {view === "days" && (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  onClick={() => setView("months")}
                >
                  {SHORT_MONTHS[month.getMonth()]}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  onClick={() => {
                    setYearPageStart(Math.floor(month.getFullYear() / 12) * 12);
                    setView("years");
                  }}
                >
                  {month.getFullYear()}
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className={navBtn} aria-label="Previous month" disabled={!canPrevMonth} onClick={goPrevMonth}>
                  <ChevronLeft />
                </button>
                <button type="button" className={navBtn} aria-label="Next month" disabled={!canNextMonth} onClick={goNextMonth}>
                  <ChevronRight />
                </button>
              </div>
            </>
          )}

          {view === "months" && (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Back to calendar"
                  onClick={() => setView("days")}
                >
                  <ChevronLeft />
                </button>
                <span className="text-sm font-semibold tabular-nums text-slate-800">{month.getFullYear()}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className={navBtn} aria-label="Previous year" disabled={!canPrevYearInMonthView} onClick={goPrevYearMonthView}>
                  <ChevronLeft />
                </button>
                <button type="button" className={navBtn} aria-label="Next year" disabled={!canNextYearInMonthView} onClick={goNextYearMonthView}>
                  <ChevronRight />
                </button>
              </div>
            </>
          )}

          {view === "years" && (
            <>
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Back to calendar"
                  onClick={() => setView("days")}
                >
                  <ChevronLeft />
                </button>
                <span className="text-sm font-semibold tabular-nums text-slate-800">
                  {yearPageStart} – {yearPageEnd}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={navBtn}
                  aria-label="Previous years"
                  disabled={!canPrevYearPage}
                  onClick={() => setYearPageStart((s) => s - 12)}
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  className={navBtn}
                  aria-label="Next years"
                  disabled={!canNextYearPage}
                  onClick={() => setYearPageStart((s) => s + 12)}
                >
                  <ChevronRight />
                </button>
              </div>
            </>
          )}
        </div>

        {view === "days" && (
          <div className="flex justify-center">
            <DayPicker
              mode="single"
              locale={enIN}
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              onSelect={(d) => {
                if (d) onChange(dateToYmdIST(d));
                setOpen(false);
              }}
              disabled={disabledMatcher}
              showOutsideDays
              hideNavigation
              captionLayout="label"
              startMonth={startMonth}
              endMonth={endMonth}
              className="rdp-root"
              classNames={{ month_caption: "hidden" }}
            />
          </div>
        )}

        {view === "months" && (
          <div className="picker-view-grid grid grid-cols-3 gap-2 px-0.5 pb-1 pt-1">
            {SHORT_MONTHS.map((label, idx) => {
              const dis = monthDisabled(month.getFullYear(), idx);
              const isCurrent = month.getMonth() === idx;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={dis}
                  onClick={() => {
                    const next = new Date(month.getFullYear(), idx, 1);
                    if (monthKey(next) < monthKey(startMonth)) setMonth(startMonth);
                    else if (monthKey(next) > monthKey(endMonth)) setMonth(endMonth);
                    else setMonth(next);
                    setView("days");
                  }}
                  className={
                    "rounded-lg border px-2 py-2.5 text-center text-sm font-medium transition " +
                    (dis
                      ? "cursor-not-allowed border-slate-100 text-slate-300"
                      : isCurrent
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {view === "years" && (
          <div className="picker-view-grid grid grid-cols-3 gap-2 px-0.5 pb-1 pt-1">
            {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((y) => {
              const dis = yearDisabled(y);
              const isCurrent = month.getFullYear() === y;
              return (
                <button
                  key={y}
                  type="button"
                  disabled={dis}
                  onClick={() => {
                    const next = new Date(y, month.getMonth(), 1);
                    if (monthKey(next) < monthKey(startMonth)) setMonth(startMonth);
                    else if (monthKey(next) > monthKey(endMonth)) setMonth(endMonth);
                    else setMonth(next);
                    setView("months");
                  }}
                  className={
                    "rounded-lg border px-2 py-2.5 text-center text-sm font-medium tabular-nums transition " +
                    (dis
                      ? "cursor-not-allowed border-slate-100 text-slate-300"
                      : isCurrent
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60")
                  }
                >
                  {y}
                </button>
              );
            })}
          </div>
        )}

        {showQuickActions && view === "days" && (
          <div className="mt-2 flex items-center justify-center gap-4 border-t border-slate-100 pt-2">
            {!required && (
              <button
                type="button"
                className="text-xs font-medium text-slate-600 hover:text-emerald-800"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="text-xs font-medium text-emerald-700 hover:underline"
              onClick={() => {
                const t = istTodayYmd();
                if (min && t < min) return;
                if (max && t > max) return;
                onChange(t);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        )}
      </div>,
      document.body
    );

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={triggerClass}
      >
        <span className={value ? "tabular-nums" : "text-slate-400"}>{value ? formatDdMmYyyy(value) : placeholder}</span>
        <CalendarIcon className="shrink-0 text-slate-400" />
      </button>
      {panel}
    </div>
  );
}
