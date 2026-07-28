"use client";

import Image from "next/image";
import { Download, FileImage, FileText } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Visible card ≈ 300×189; export uses pixelRatio 3 → ~900×567. */
const CARD_ASPECT = "1.586 / 1";
/** ISO/IEC 7810 ID-1 (credit card) size in mm. */
const PDF_PAGE_WIDTH_MM = 85.6;
const PDF_PAGE_HEIGHT_MM = 54;
/** Outer margin so the card fills ~94% of the PDF page. */
const PDF_MARGIN_MM = 1.6;
const EXPORT_PIXEL_RATIO = 3;

export type EmployeeSmartCardProps = {
  employeeName: string;
  employeeNumber?: string | null;
  designation?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  avatarUrl: string;
  className?: string;
  onDownloadError?: (message: string) => void;
};

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function preloadImage(src: string): Promise<void> {
  if (!src) return;
  await new Promise<void>((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src.includes("?") ? `${src}&_=${Date.now()}` : `${src}?_=${Date.now()}`;
  });
}

/**
 * Capture only the card bounds (no box-shadow / transform inflation).
 * Shadows make html-to-image expand the canvas and leave empty margins in PDF/PNG.
 */
async function captureSmartCardPng(el: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");

  const prevShadow = el.style.boxShadow;
  const prevFilter = el.style.filter;
  const prevTransform = el.style.transform;
  const prevTransition = el.style.transition;

  el.style.boxShadow = "none";
  el.style.filter = "none";
  el.style.transform = "none";
  el.style.transition = "none";

  try {
    // Double-capture: first warms fonts/images; second is the sharp export.
    await toPng(el, {
      cacheBust: true,
      pixelRatio: EXPORT_PIXEL_RATIO,
      backgroundColor: "#5b21b6",
    });
    return await toPng(el, {
      cacheBust: true,
      pixelRatio: EXPORT_PIXEL_RATIO,
      backgroundColor: "#5b21b6",
    });
  } finally {
    el.style.boxShadow = prevShadow;
    el.style.filter = prevFilter;
    el.style.transform = prevTransform;
    el.style.transition = prevTransition;
  }
}

function buildFilename(base: string, displayEmployeeNumber: string, displayName: string): string {
  const codePart = displayEmployeeNumber ? sanitizeFilenamePart(displayEmployeeNumber) : "";
  const namePart = sanitizeFilenamePart(displayName);
  return codePart ? `smart-card-${codePart}.${base}` : `employee-smart-card-${namePart || "employee"}.${base}`;
}

export function EmployeeSmartCard({
  employeeName,
  employeeNumber,
  designation,
  companyName,
  companyLogoUrl,
  avatarUrl,
  className,
  onDownloadError,
}: EmployeeSmartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = employeeName.trim() || "Employee";
  const displayDesignation = designation?.trim() || "Employee";
  const displayEmployeeNumber = employeeNumber?.trim() || "";
  const displayCompanyName = companyName?.trim() || "";

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleDownloadPng = useCallback(async () => {
    const el = cardRef.current;
    if (!el || downloading) return;

    setDownloading(true);
    setMenuOpen(false);
    try {
      await Promise.all([
        preloadImage(avatarUrl),
        companyLogoUrl ? preloadImage(companyLogoUrl) : Promise.resolve(),
      ]);

      const dataUrl = await captureSmartCardPng(el);
      const link = document.createElement("a");
      link.download = buildFilename("png", displayEmployeeNumber, displayName);
      link.href = dataUrl;
      link.click();
    } catch {
      onDownloadError?.("Unable to download Smart Card. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [avatarUrl, companyLogoUrl, displayEmployeeNumber, displayName, downloading, onDownloadError]);

  const handleDownloadPdf = useCallback(async () => {
    const el = cardRef.current;
    if (!el || downloading) return;

    setDownloading(true);
    setMenuOpen(false);
    try {
      await Promise.all([
        preloadImage(avatarUrl),
        companyLogoUrl ? preloadImage(companyLogoUrl) : Promise.resolve(),
      ]);

      const { jsPDF } = await import("jspdf");
      const dataUrl = await captureSmartCardPng(el);

      // ID-1 page size (≈85.6×54mm). Pass [width, height] with landscape.
      // Verified: jsPDF yields getWidth=85.6, getHeight=54 for this pair.
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM],
        compress: true,
      });

      let pageW = pdf.internal.pageSize.getWidth();
      let pageH = pdf.internal.pageSize.getHeight();

      // If orientation unexpectedly swapped, force correct landscape dims.
      if (pageW < pageH) {
        const tmp = pageW;
        pageW = pageH;
        pageH = tmp;
      }

      const margin = PDF_MARGIN_MM;
      const imgW = pageW - margin * 2;
      const imgH = pageH - margin * 2;

      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, "F");
      pdf.addImage(dataUrl, "PNG", margin, margin, imgW, imgH, undefined, "FAST");

      pdf.save(buildFilename("pdf", displayEmployeeNumber, displayName));
    } catch {
      onDownloadError?.("Unable to download Smart Card. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [avatarUrl, companyLogoUrl, displayEmployeeNumber, displayName, downloading, onDownloadError]);

  return (
    <div className={cn("relative mx-auto w-full max-w-[300px]", className)}>
      <div
        ref={cardRef}
        className="relative w-full overflow-hidden rounded-[14px] border border-violet-400/30 shadow-md transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-lg"
        style={{
          aspectRatio: CARD_ASPECT,
          background: "linear-gradient(135deg, #6d28d9 0%, #7c3aed 45%, #5b21b6 100%)",
        }}
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-white/25" aria-hidden="true" />

        <div className="flex h-full flex-col gap-2.5 p-3 pl-3.5 text-white">
          <div className="flex items-center gap-2 border-b border-white/15 pb-2">
            {companyLogoUrl ? (
              <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-white/95 p-0.5">
                <Image
                  src={companyLogoUrl}
                  alt=""
                  width={24}
                  height={24}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
            ) : null}
            <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
              Employee Smart Card
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt=""
                width={44}
                height={44}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
                draggable={false}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold uppercase leading-tight tracking-wide">
                {displayName}
              </p>
              <p className="truncate text-[11px] leading-snug text-violet-100/95">{displayDesignation}</p>
            </div>
          </div>

          <div className="mt-0.5 space-y-1.5">
            {displayEmployeeNumber ? (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                  Employee ID
                </p>
                <p className="truncate text-[12px] font-semibold tracking-wide">{displayEmployeeNumber}</p>
              </div>
            ) : null}
            {displayCompanyName ? (
              <p className="line-clamp-2 text-[9px] font-semibold uppercase leading-snug tracking-wide text-white/90">
                {displayCompanyName}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={menuRef} className="absolute right-2 top-2 z-10">
        <button
          type="button"
          data-export-ignore
          onClick={() => setMenuOpen((v) => !v)}
          disabled={downloading}
          title="Download Smart Card"
          aria-label="Download Smart Card"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/25 bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{downloading ? "Downloading…" : "Download Smart Card"}</span>
        </button>

        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] min-w-[9.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              disabled={downloading}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => void handleDownloadPdf()}
            >
              <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Download PDF
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={downloading}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => void handleDownloadPng()}
            >
              <FileImage className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Download PNG
            </button>
          </div>
        ) : null}
      </div>

      {downloading ? (
        <p className="pointer-events-none absolute -bottom-5 right-0 text-[10px] font-medium text-slate-500">
          Downloading…
        </p>
      ) : null}
    </div>
  );
}
