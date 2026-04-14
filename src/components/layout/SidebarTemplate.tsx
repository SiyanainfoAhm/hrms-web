"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Grid3X3,
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
  const { expanded, toggle } = useSidebarState();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/company/me");
        const data = await res.json();
        if (cancelled) return;
        const raw = data?.company?.logo_url;
        const url = typeof raw === "string" && raw.trim() ? raw.trim() : null;
        setCompanyLogoUrl(url);
      } catch {
        if (!cancelled) setCompanyLogoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen z-30 bg-[var(--surface)] border-r border-[var(--border)] transition-all duration-200 flex flex-col",
        expanded ? "w-56" : "w-16"
      )}
    >
      <div
        className={cn(
          "flex px-4 py-4 border-b border-[var(--border)] relative",
          expanded ? "items-center justify-between" : "flex-col items-center justify-center"
        )}
      >
        <div className={cn("flex items-center min-w-0", expanded ? "gap-3" : "justify-center w-full")}>
          {companyLogoUrl ? (
            <div
              className={cn(
                "rounded-full border border-[var(--border)] bg-white flex items-center justify-center overflow-hidden",
                expanded ? "w-8 h-8" : "w-10 h-10",
              )}
              aria-hidden
            >
              <img src={companyLogoUrl} alt="" className="h-full w-full object-contain" />
            </div>
          ) : (
            <div
              className={cn(
                "rounded-full border bg-[var(--primary-soft)] text-[var(--primary)] font-bold flex items-center justify-center",
                expanded ? "w-8 h-8" : "w-10 h-10",
              )}
            >
              {branding.logoText ?? branding.appShortName.slice(0, 1)}
            </div>
          )}
          {expanded && <span className="font-bold text-lg flex-1 truncate">{branding.appShortName}</span>}
        </div>

        <button
          className={cn("transition-all duration-200", expanded ? "ml-auto" : "absolute right-2 top-1/2 -translate-y-1/2")}
          onClick={toggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          type="button"
        >
          <svg
            className={cn("w-5 h-5 transition-transform duration-200", expanded ? "rotate-0" : "rotate-180")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
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
    </aside>
  );
}

