"use client";

import { cn } from "../../lib/cn";
import { appConfig } from "../../config/appConfig";
import { BrandedMarketingAside, type BrandVariant } from "../branding/BrandedMarketingAside";
import { LegalLinksRow } from "./LegalLinksRow";

export function AuthLayout({
  title,
  subtitle,
  children,
  variant = "login",
  branding = appConfig
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: BrandVariant;
  branding?: typeof appConfig;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] lg:flex-row">
      <BrandedMarketingAside variant={variant} branding={branding} />

      <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-start px-4 py-8 sm:px-8 lg:w-1/2 lg:flex-none lg:justify-center lg:py-12">
        <div
          className={cn(
            "w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8",
            "animate-fade-in"
          )}
        >
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p> : null}
          </header>

          {children}

          <LegalLinksRow className="mt-8 border-t border-[var(--border)] pt-6" />
        </div>
        <p className="mt-6 max-w-md text-center text-xs text-[var(--muted)]">Secure access for authorised users only.</p>
      </main>
    </div>
  );
}
