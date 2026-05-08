"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Screenshot = {
  id: string;
  capturedAt: string | null;
  triggerType: string | null;
  appName: string | null;
  windowTitle: string | null;
  mouseActive: boolean;
  keyboardActive: boolean;
  idleSeconds: number;
  url: string;
};

function ScreenshotImage({
  url,
  alt,
  className,
  onClick,
}: {
  url: string;
  alt: string;
  className: string;
  onClick?: () => void;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center bg-slate-100 text-[10px] text-slate-500`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 mb-1" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.29 3.86l-7.36 12a2 2 0 0 0 1.71 3h14.72a2 2 0 0 0 1.71-3l-7.36-12a2 2 0 0 0-3.42 0z" />
        </svg>
        Failed to load
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 underline hover:text-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          Open in new tab
        </a>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      // referrerPolicy avoids Referer-based 403s from signed-URL providers.
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setErrored(true)}
      onClick={onClick}
      className={className}
    />
  );
}

const IST_TZ = "Asia/Kolkata";

function formatIstFull(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: IST_TZ,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function formatIstTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: IST_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

export function AttendanceScreenshotsDialog({
  open,
  onClose,
  logId,
  employeeName,
  workDate,
}: {
  open: boolean;
  onClose: () => void;
  logId: string | null;
  employeeName?: string | null;
  workDate?: string | null;
}) {
  const [items, setItems] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !logId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setExpandedIdx(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/attendance/screenshots?logId=${encodeURIComponent(logId)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Failed to load screenshots");
        setItems(Array.isArray(data.screenshots) ? data.screenshots : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load screenshots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, logId]);

  const total = items.length;

  const expanded = useMemo(
    () => (expandedIdx == null ? null : items[expandedIdx] ?? null),
    [expandedIdx, items],
  );

  /**
   * Navigation is bounded — no wrap-around. Buttons are hidden when the
   * user is at the first/last screenshot, so we only act when there's
   * actually a neighbour to move to.
   */
  const canPrev = expandedIdx != null && expandedIdx > 0;
  const canNext = expandedIdx != null && expandedIdx < items.length - 1;

  const goPrev = useCallback(() => {
    setExpandedIdx((idx) => (idx != null && idx > 0 ? idx - 1 : idx));
  }, []);

  const goNext = useCallback(() => {
    setExpandedIdx((idx) => (idx != null && idx < items.length - 1 ? idx + 1 : idx));
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (expandedIdx == null) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setExpandedIdx(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, expandedIdx, goPrev, goNext]);

  /**
   * While the lightbox is open, neutralise the parent Dialog's `onClose`.
   * Headless UI's outside-click watcher listens on `pointerdown`/`mousedown`
   * at the document level — those fire before React's `onClick`, so even
   * a chevron tap is treated as "click outside the grid panel" and tears
   * the whole dialog down. Suppressing close requests here means the grid
   * stays mounted; the lightbox owns its own close (backdrop click, ✕,
   * or Esc → `setExpandedIdx(null)`).
   */
  const handleParentClose = useCallback(() => {
    if (expandedIdx != null) return;
    onClose();
  }, [expandedIdx, onClose]);

  return (
    <Dialog open={open} onClose={handleParentClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <DialogTitle as="h3" className="text-base font-semibold text-slate-900">
                Activity screenshots
              </DialogTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                {employeeName ? <span className="font-medium text-slate-700">{employeeName}</span> : "Employee"}
                {workDate ? <span className="ml-1">· {workDate}</span> : null}
                <span className="ml-1">· Times shown in IST</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-5 py-5">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-video animate-pulse rounded-lg border border-slate-100 bg-slate-100"
                  />
                ))}
              </div>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : total === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">No screenshots captured.</p>
                <p className="mt-1 text-xs text-slate-500">
                  The desktop agent did not record any activity screenshots for this attendance entry.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {items.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setExpandedIdx(idx)}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left shadow-sm transition hover:border-[var(--primary)] hover:shadow-md focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                      <ScreenshotImage
                        url={s.url}
                        alt={`Screenshot at ${formatIstTime(s.capturedAt)}`}
                        className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-2.5 py-1.5">
                      <span className="tabular-nums text-xs font-medium text-slate-700">
                        {formatIstTime(s.capturedAt)}
                      </span>
                      {s.triggerType ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                          {s.triggerType}
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-500">
            <span>{total > 0 ? `${total} screenshot${total === 1 ? "" : "s"}` : ""}</span>
            <span>Click any thumbnail to expand</span>
          </div>
        </DialogPanel>
      </div>

      {/* Expanded viewer.
       *
       * Stop pointer/mouse events at the lightbox root so Headless UI's
       * outside-click watcher (which runs on `pointerdown`/`mousedown`,
       * not `click`) doesn't think a chevron tap is a click outside the
       * grid `<DialogPanel>` and tear the whole dialog down before
       * `onClick` fires.
       */}
      {expanded ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setExpandedIdx(null)}
        >
          {canPrev ? (
            <button
              type="button"
              aria-label="Previous"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          {canNext ? (
            <button
              type="button"
              aria-label="Next"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedIdx(null);
            }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-h-[78vh] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
              <ScreenshotImage
                url={expanded.url}
                alt={`Screenshot at ${formatIstFull(expanded.capturedAt)}`}
                className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
              />
            </div>
            <div className="w-full rounded-lg bg-white/95 px-4 py-3 text-sm text-slate-800 shadow">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Captured (IST)</p>
                  <p className="tabular-nums font-semibold text-slate-900">
                    {formatIstFull(expanded.capturedAt)}
                  </p>
                </div>
                <div className="text-xs text-slate-600">
                  {expanded.appName ? <span className="font-medium">{expanded.appName}</span> : null}
                  {expanded.windowTitle ? (
                    <span className="ml-1 text-slate-500">· {expanded.windowTitle}</span>
                  ) : null}
                  {expandedIdx != null ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {expandedIdx + 1} / {total}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
