"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { enIN } from "date-fns/locale/en-IN";
import {
  addDaysIST,
  dateToYmdIST,
  istTodayYmd,
  lastMonthRangeIST,
  lastWeekRangeIST,
  thisMonthRangeIST,
  thisWeekRangeIST,
  ymdToNoonIST,
} from "@/lib/istCalendar";

export type AttendancePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

const PRESETS: { id: AttendancePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom range" },
];

function computePresetRange(id: Exclude<AttendancePreset, "custom">, anchorYmd: string): { start: string; end: string } {
  switch (id) {
    case "today":
      return { start: anchorYmd, end: anchorYmd };
    case "yesterday":
      return { start: addDaysIST(anchorYmd, -1), end: addDaysIST(anchorYmd, -1) };
    case "this_week":
      return thisWeekRangeIST(anchorYmd);
    case "last_week":
      return lastWeekRangeIST(anchorYmd);
    case "this_month":
      return thisMonthRangeIST(anchorYmd);
    case "last_month":
      return lastMonthRangeIST(anchorYmd);
    default:
      return { start: anchorYmd, end: anchorYmd };
  }
}

function formatRangeLabel(start: string, end: string): string {
  if (start === end) {
    return new Date(`${start}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const a = new Date(`${start}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const b = new Date(`${end}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

export function AttendanceDateFilter({
  startDate,
  endDate,
  preset,
  onChange,
}: {
  startDate: string;
  endDate: string;
  preset: AttendancePreset;
  onChange: (next: { startDate: string; endDate: string; preset: AttendancePreset }) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [monthCount, setMonthCount] = useState(1);
  const [rangeDraft, setRangeDraft] = useState<DateRange | undefined>(() => ({
    from: ymdToNoonIST(startDate),
    to: ymdToNoonIST(endDate),
  }));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setMonthCount(mq.matches ? 2 : 1);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!customOpen) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setCustomOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [customOpen]);

  function applyPreset(id: AttendancePreset) {
    if (id === "custom") {
      if (!customOpen) {
        setRangeDraft({
          from: ymdToNoonIST(startDate),
          to: ymdToNoonIST(endDate),
        });
      }
      setCustomOpen((o) => !o);
      return;
    }
    setCustomOpen(false);
    const anchor = istTodayYmd();
    const { start, end } = computePresetRange(id, anchor);
    onChange({ startDate: start, endDate: end, preset: id });
  }

  function applyCustom() {
    const from = rangeDraft?.from;
    const to = rangeDraft?.to ?? rangeDraft?.from;
    if (!from) return;
    const start = dateToYmdIST(from);
    const end = to ? dateToYmdIST(to) : start;
    const lo = start <= end ? start : end;
    const hi = start <= end ? end : start;
    onChange({ startDate: lo, endDate: hi, preset: "custom" });
    setCustomOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active =
            p.id === "custom" ? preset === "custom" || customOpen : preset === p.id && !customOpen;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white shadow-sm ring-1 ring-black/5 hover:brightness-95"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600">Selected period (IST)</p>
          <p className="text-sm font-semibold text-gray-900">{formatRangeLabel(startDate, endDate)}</p>
        </div>
        {preset === "custom" && (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80">
            Custom
          </span>
        )}
      </div>

      {customOpen && (
        <div
          ref={panelRef}
          className="relative z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5"
        >
          <p className="mb-3 text-sm font-medium text-gray-800">Pick a range or a single day (second click completes the range)</p>
          <div className="rdp-theme attendance-day-picker flex justify-center overflow-x-auto">
            <DayPicker
              mode="range"
              locale={enIN}
              numberOfMonths={monthCount}
              selected={rangeDraft}
              onSelect={setRangeDraft}
              defaultMonth={ymdToNoonIST(startDate)}
              showOutsideDays
              className="rdp-root"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              onClick={() => setCustomOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-white hover:brightness-95 transition"
              onClick={() => applyCustom()}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
