"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Grid3X3,
  Check,
  PanelsLeftBottom,
  Settings,
  User,
  Users
} from "lucide-react";
import { appConfig } from "../../config/appConfig";
import type { SidebarIconId, SidebarSection } from "../../config/sidebarConfig";
import { sidebarConfig } from "../../config/sidebarConfig";
import type { Actor } from "../../lib/permissions";
import { hasAnyPermission, hasAnyRole } from "../../lib/permissions";
import { cn } from "../../lib/cn";
import { useSidebarState } from "./SidebarState";
import { getLocalStorageItem, setLocalStorageItem } from "../../lib/storage";

function iconFor(kind: NonNullable<SidebarIconId>) {
  switch (kind) {
    case "grid":
      return Grid3X3;
    case "users":
      return Users;
    case "clipboard":
      return ClipboardList;
    case "settings":
      return Settings;
    case "credit-card":
      return CreditCard;
    case "calendar":
      return CalendarDays;
    case "badge-check":
      return BadgeCheck;
    case "user":
      return User;
    default:
      return Grid3X3;
  }
}

export function SidebarTemplate({
  actor,
  sections = sidebarConfig,
  branding = appConfig
}: {
  actor: Actor | null | undefined;
  sections?: SidebarSection[];
  branding?: typeof appConfig;
}) {
  const pathname = usePathname();
  const { expanded, mode, setHovering, setMode } = useSidebarState();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [sidebarControlOpen, setSidebarControlOpen] = useState(false);
  const [sidebarControlPos, setSidebarControlPos] = useState<{ left: number; top: number } | null>(null);

  const companyLogoCacheKey = "hrms_company_logo_url_v1";

  const sidebarControlOptions = useMemo(
    () =>
      [
        { id: "expanded" as const, label: "Expanded", helper: "Always open" },
        { id: "collapsed" as const, label: "Collapsed", helper: "Icons only" },
        { id: "hover" as const, label: "Expand on hover", helper: "Peek when needed" },
      ] as const,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fast path: show cached logo immediately (avoids refetch on every open).
        const cached = getLocalStorageItem(companyLogoCacheKey);
        if (cached && typeof cached === "string" && cached.trim()) {
          setCompanyLogoUrl(cached.trim());
        }

        const res = await fetch("/api/company/me");
        const data = await res.json();
        if (cancelled) return;
        const raw = data?.company?.logo_url;
        const url = typeof raw === "string" && raw.trim() ? raw.trim() : null;
        setCompanyLogoUrl(url);
        if (url) setLocalStorageItem(companyLogoCacheKey, url);
        else setLocalStorageItem(companyLogoCacheKey, "");
      } catch {
        if (!cancelled) setCompanyLogoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = document.getElementById("sidebar-control-popover");
      const btn = document.getElementById("sidebar-control-button");
      if (!el || !btn) return;
      if (e.target instanceof Node && !el.contains(e.target) && !btn.contains(e.target)) {
        setSidebarControlOpen(false);
      }
    }
    if (sidebarControlOpen) document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [sidebarControlOpen]);

  useLayoutEffect(() => {
    function updatePos() {
      const btn = document.getElementById("sidebar-control-button");
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const pop = document.getElementById("sidebar-control-popover");
      const gap = 12;
      const viewportPad = 8;
      const popW = pop ? pop.getBoundingClientRect().width : 256;
      const popH = pop ? pop.getBoundingClientRect().height : 220;

      // Prefer to open to the right of the sidebar.
      let left = r.right + gap;
      // If it would overflow right edge, open to the left of the button.
      if (left + popW > window.innerWidth - viewportPad) {
        left = r.left - gap - popW;
      }
      left = Math.max(viewportPad, Math.min(left, window.innerWidth - popW - viewportPad));

      // Prefer to align popover bottom to button bottom (so it opens upward for bottom buttons).
      let top = r.bottom - popH;
      // Clamp within viewport.
      top = Math.max(viewportPad, Math.min(top, window.innerHeight - popH - viewportPad));

      setSidebarControlPos({ left: Math.round(left), top: Math.round(top) });
    }
    if (!sidebarControlOpen) return;
    updatePos();
    // Run once more on next frame after first render so we can measure actual popover size.
    const raf = requestAnimationFrame(updatePos);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [sidebarControlOpen, expanded]);

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen z-30 bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-200 flex flex-col",
        expanded ? "w-56" : "w-16"
      )}
      onMouseEnter={() => {
        if (mode === "hover") setHovering(true);
      }}
      onMouseLeave={() => {
        if (mode === "hover") setHovering(false);
      }}
    >
      <div
        className={cn(
          "flex px-4 py-4 border-b border-[var(--border)] relative",
          expanded ? "items-center justify-between" : "flex-col items-center justify-center"
        )}
      >
        <div className={cn("flex items-center min-w-0", expanded ? "w-full" : "justify-center w-full")}>
          {companyLogoUrl ? (
            expanded ? (
              <div
                className="w-full h-10 rounded-lg bg-transparent overflow-hidden flex items-center justify-center"
                aria-hidden
              >
                <Image
                  unoptimized
                  src={companyLogoUrl}
                  alt=""
                  width={220}
                  height={40}
                  className="h-full w-full object-contain bg-transparent px-1"
                />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-lg bg-transparent overflow-hidden flex items-center justify-center"
                aria-hidden
              >
                <Image
                  unoptimized
                  src={companyLogoUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-contain bg-transparent"
                />
              </div>
            )
          ) : (
            <div
              className={cn(
                "rounded-lg border bg-[var(--primary-soft)] text-[var(--primary)] font-bold flex items-center justify-center",
                expanded ? "w-full h-10 text-base" : "w-10 h-10",
              )}
            >
              {branding.logoText ?? branding.appShortName.slice(0, 1)}
            </div>
          )}
          {expanded && <span className="sr-only">{branding.appShortName}</span>}
        </div>
      </div>

      <nav className="flex-1 mt-4 px-2">
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => {
            const okRole = hasAnyRole(actor, item.requiresAnyRole);
            const okPerm = hasAnyPermission(actor, item.requiresAnyPermission);
            return okRole && okPerm;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.key} className="mb-4">
              {expanded && section.label && (
                <div className="px-2 mb-2 text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                  {section.label}
                </div>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon ? iconFor(item.icon) : Grid3X3;
                const hrefPath = item.href.split("#")[0] ?? item.href;
                const active =
                  pathname === hrefPath || (hrefPath !== "/" && pathname.startsWith(`${hrefPath}/`));

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 my-1 rounded-lg transition-colors",
                      active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-gray-700 hover:bg-gray-100",
                      expanded ? "justify-start" : "justify-center"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {expanded && <span className="ml-1 text-sm">{item.label}</span>}
                    {active && expanded && <span className="ml-auto w-2 h-2 bg-[var(--primary)] rounded-full" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className={cn("border-t border-[var(--border)] p-2", expanded ? "px-3" : "px-2")}>
        <div className={cn("flex items-center relative", expanded ? "justify-between" : "justify-center")}>
          {expanded && <div className="sr-only">Sidebar</div>}

          <div className="relative">
            <button
              id="sidebar-control-button"
              type="button"
              aria-label="Sidebar control"
              title="Sidebar control"
              onClick={() => setSidebarControlOpen((v) => !v)}
              className={cn(
                "h-10 w-10 rounded-lg border border-gray-200 bg-gray-50 grid place-items-center transition",
                "text-gray-700 hover:bg-white hover:shadow-sm",
              )}
            >
              <PanelsLeftBottom className="h-4 w-4" />
            </button>

            {sidebarControlOpen && sidebarControlPos && (
              <div
                id="sidebar-control-popover"
                className="fixed z-[9999] w-64 rounded-2xl border border-gray-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.22)]"
                style={{
                  left: sidebarControlPos.left,
                  top: sidebarControlPos.top,
                }}
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                    Sidebar control
                  </div>
                </div>
                <div className="p-2">
                  {sidebarControlOptions.map((opt) => {
                    const active = mode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMode(opt.id);
                          setSidebarControlOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition",
                          active
                            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                            : "text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        <span className={cn("w-5 h-5 grid place-items-center", active ? "text-[var(--primary)]" : "text-transparent")}>
                          <Check className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{opt.label}</span>
                          <span className={cn("block text-xs", active ? "text-[var(--primary)]/80" : "text-gray-500")}>
                            {opt.helper}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

