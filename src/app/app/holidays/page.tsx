"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useHrmsSession } from "@/hooks/useHrmsSession";
import { PaginationBar } from "@/components/common/PaginationBar";
import { SkeletonTable } from "@/components/common/Skeleton";
import { HrmsShellPage } from "@/components/layout/HrmsShellPage";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import { DatePickerField } from "@/components/ui/DatePickerField";

type Holiday = {
  id: string;
  name: string;
  holiday_date: string;
  holiday_end_date: string | null;
  is_optional: boolean;
  location: string | null;
};

const TAB_ALL = "ALL";
const TAB_EMPTY = "EMPTY";
function formatHolidayDayAndDate(ymd: string): string {
  const raw = String(ymd).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  return dt.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatHolidayDayDateRange(h: Holiday): string {
  const start = String(h.holiday_date).slice(0, 10);
  const endRaw = h.holiday_end_date ? String(h.holiday_end_date).slice(0, 10) : "";
  if (!endRaw || endRaw === start) return formatHolidayDayAndDate(start);
  return `${formatHolidayDayAndDate(start)} → ${formatHolidayDayAndDate(endRaw)}`;
}

export default function HolidaysPage() {
  const { role } = useHrmsSession();
  const canManage = role === "super_admin";

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeLocationTab, setActiveLocationTab] = useState<string>(TAB_ALL);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayEndDate, setHolidayEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [isOptional, setIsOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Holiday | null>(null);
  const [holidayListPage, setHolidayListPage] = useState(1);
  const holidayPageSize = useResponsivePageSize();

  const locationTabs = useMemo(() => {
    const locs = new Set<string>();
    let hasEmpty = false;
    for (const h of holidays) {
      const t = (h.location || "").trim();
      if (!t) hasEmpty = true;
      else locs.add(t);
    }
    const sorted = [...locs].sort((a, b) => a.localeCompare(b));
    const tabs: { key: string; label: string }[] = [{ key: TAB_ALL, label: "All locations" }];
    if (hasEmpty) tabs.push({ key: TAB_EMPTY, label: "All offices" });
    for (const loc of sorted) tabs.push({ key: loc, label: loc });
    return tabs;
  }, [holidays]);

  const filteredHolidays = useMemo(() => {
    let list: Holiday[];
    if (activeLocationTab === TAB_ALL) list = [...holidays];
    else if (activeLocationTab === TAB_EMPTY) list = holidays.filter((h) => !(h.location || "").trim());
    else list = holidays.filter((h) => (h.location || "").trim() === activeLocationTab);
    return list.sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
  }, [holidays, activeLocationTab]);

  useEffect(() => {
    setHolidayListPage(1);
  }, [activeLocationTab]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredHolidays.length / holidayPageSize));
    setHolidayListPage((p) => Math.min(p, tp));
  }, [filteredHolidays.length, holidayPageSize]);

  const pagedHolidays = useMemo(() => {
    const start = (holidayListPage - 1) * holidayPageSize;
    return filteredHolidays.slice(start, start + holidayPageSize);
  }, [filteredHolidays, holidayListPage, holidayPageSize]);

  useEffect(() => {
    setHolidayListPage(1);
  }, [holidayPageSize]);

  useEffect(() => {
    const keys = new Set(locationTabs.map((t) => t.key));
    if (!keys.has(activeLocationTab)) setActiveLocationTab(TAB_ALL);
  }, [locationTabs, activeLocationTab]);

  async function loadHolidays() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/holidays");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load holidays");
      setHolidays(data.holidays || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadHolidays();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsDialogOpen(false);
    }
    if (isDialogOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDialogOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !deletingId) setDeleteConfirm(null);
    }
    if (deleteConfirm) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteConfirm, deletingId]);

  function resetForm() {
    setFormError(null);
    setEditingHoliday(null);
    setName("");
    setHolidayDate("");
    setHolidayEndDate("");
    setLocation("");
    setIsOptional(false);
  }

  function openAddDialog() {
    resetForm();
    setIsDialogOpen(true);
  }

  function openEditDialog(h: Holiday) {
    setFormError(null);
    setEditingHoliday(h);
    setName(h.name);
    setHolidayDate(String(h.holiday_date).slice(0, 10));
    const end = h.holiday_end_date ? String(h.holiday_end_date).slice(0, 10) : "";
    const start = String(h.holiday_date).slice(0, 10);
    setHolidayEndDate(end && end !== start ? end : "");
    setLocation((h.location || "").trim());
    setIsOptional(Boolean(h.is_optional));
    setIsDialogOpen(true);
  }

  async function submitHoliday(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const endTrim = holidayEndDate.trim();
    if (endTrim && endTrim < holidayDate) {
      setFormError("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    try {
      const endPayload =
        endTrim && endTrim !== holidayDate ? endTrim : null;
      if (editingHoliday) {
        const res = await fetch(`/api/holidays/${editingHoliday.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            holidayDate,
            holidayEndDate: endPayload,
            location: location.trim() || null,
            isOptional,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to update holiday");
        const updated = data.holiday as Holiday;
        setHolidays((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        resetForm();
        setIsDialogOpen(false);
      } else {
        const res = await fetch("/api/holidays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            holidayDate,
            ...(endPayload ? { holidayEndDate: endPayload } : {}),
            location: location.trim() || undefined,
            isOptional,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to add holiday");
        setHolidays((prev) => [...prev, data.holiday]);
        resetForm();
        setIsDialogOpen(false);
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function executeDeleteHoliday() {
    if (!deleteConfirm) return;
    const h = deleteConfirm;
    setDeletingId(h.id);
    setError(null);
    try {
      const res = await fetch(`/api/holidays/${h.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete holiday");
      setHolidays((prev) => prev.filter((x) => x.id !== h.id));
      setDeleteConfirm(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <HrmsShellPage
      title="Holidays"
      description="Company holiday calendar. Multi-day ranges, optional flags, and location filters — same rules as HRMS."
    >
    <section className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={openAddDialog}>
            Add holiday
          </button>
        </div>
      )}

      {!loading && holidays.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {locationTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveLocationTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeLocationTab === tab.key
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {isDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={() => {
              resetForm();
              setIsDialogOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingHoliday ? "Edit holiday" : "Add holiday"}
                </h2>
                <p className="text-sm text-slate-500">
                  {editingHoliday ? "Update this holiday entry." : "Create a holiday for your company."}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  resetForm();
                  setIsDialogOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <form onSubmit={submitHoliday} className="p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Holiday name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                  <DatePickerField value={holidayDate} onChange={setHolidayDate} required className="w-full" />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">End date (optional)</label>
                  <DatePickerField
                    value={holidayEndDate}
                    onChange={setHolidayEndDate}
                    min={holidayDate || undefined}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-slate-500">Leave empty or same as start for a single day.</p>
                </div>
                <div className="md:col-span-4">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Location (optional)</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Ahmedabad, or leave empty for all offices"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={isOptional} onChange={(e) => setIsOptional(e.target.checked)} />
                    Optional holiday
                  </label>
                  <div className="flex flex-col items-end">
                    {formError && <p className="text-sm text-red-600">{formError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          resetForm();
                          setIsDialogOpen(false);
                        }}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? "Saving…" : editingHoliday ? "Save changes" : "Add holiday"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && canManage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={() => !deletingId && setDeleteConfirm(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-holiday-title"
            className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 id="delete-holiday-title" className="text-base font-semibold text-slate-900">
                Delete holiday
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Delete holiday <span className="font-medium text-slate-900">&ldquo;{deleteConfirm.name}&rdquo;</span>
                <span className="text-slate-500"> ({formatHolidayDayDateRange(deleteConfirm)})</span>?
              </p>
              <p className="mt-2 text-xs text-slate-500">This cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={!!deletingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline !border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => void executeDeleteHoliday()}
                disabled={!!deletingId}
              >
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : holidays.length === 0 ? (
          <p className="muted">No holidays configured.</p>
        ) : filteredHolidays.length === 0 ? (
          <p className="muted">No holidays for this location.</p>
        ) : (
          <>
            {filteredHolidays.length > holidayPageSize && (
              <div className="mb-4 md:hidden">
                <PaginationBar
                  page={holidayListPage}
                  total={filteredHolidays.length}
                  pageSize={holidayPageSize}
                  onPageChange={setHolidayListPage}
                />
              </div>
            )}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Day &amp; date</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Optional</th>
                    {canManage && <th className="px-3 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedHolidays.map((h) => (
                    <tr key={h.id} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium text-slate-900">{formatHolidayDayDateRange(h)}</td>
                      <td className="px-3 py-2">{h.name}</td>
                      <td className="px-3 py-2">{h.location?.trim() ? h.location : "—"}</td>
                      <td className="px-3 py-2">{h.is_optional ? "Yes" : "No"}</td>
                      {canManage && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn-outline !py-1 !text-xs"
                              onClick={() => openEditDialog(h)}
                              disabled={deletingId === h.id}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline !border-red-200 !py-1 !text-xs text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteConfirm(h)}
                              disabled={deletingId === h.id}
                            >
                              {deletingId === h.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {pagedHolidays.map((h) => (
                <div key={h.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-slate-900">{h.name}</p>
                  <p className="mt-1 text-sm text-slate-700">{formatHolidayDayDateRange(h)}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Location</dt>
                      <dd>{h.location?.trim() ? h.location : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Optional</dt>
                      <dd>{h.is_optional ? "Yes" : "No"}</dd>
                    </div>
                  </dl>
                  {canManage && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className="btn btn-outline text-xs"
                        onClick={() => openEditDialog(h)}
                        disabled={deletingId === h.id}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline text-xs !border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteConfirm(h)}
                        disabled={deletingId === h.id}
                      >
                        {deletingId === h.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filteredHolidays.length > holidayPageSize && (
              <div className="mt-4 hidden border-t border-slate-200 pt-4 md:block">
                <PaginationBar
                  page={holidayListPage}
                  total={filteredHolidays.length}
                  pageSize={holidayPageSize}
                  onPageChange={setHolidayListPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
    </HrmsShellPage>
  );
}
