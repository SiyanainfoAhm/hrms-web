import Link from "next/link";

import { BrandedMarketingAside } from "../components/branding/BrandedMarketingAside";
import { StartButton } from "../components/StartButton";
import { appConfig } from "../config/appConfig";
import { cn } from "../lib/cn";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] lg:flex-row">
      <BrandedMarketingAside variant="landing" branding={appConfig} />

      <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-start px-4 py-8 sm:px-8 lg:w-1/2 lg:flex-none lg:justify-center lg:py-12">
        <div
          className={cn(
            "w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8",
            "animate-fade-in"
          )}
        >
          <header className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Get started</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
              Sign in to your workspace, or create an account if you are new.
            </p>
          </header>

          <StartButton
            className={cn(
              "w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition",
              "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-95 disabled:opacity-60"
            )}
          >
            Start
          </StartButton>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
            <Link
              href="/auth/login"
              className="text-center text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Sign in
            </Link>
            <span className="hidden text-sm text-[var(--muted)] sm:inline">·</span>
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
              <span>New here?</span>
              <Link href="/auth/signup" className="font-semibold text-[var(--primary)] hover:underline">
                Create an account
              </Link>
            </div>
          </div>

          <p className="mt-8 border-t border-[var(--border)] pt-6 text-xs leading-relaxed text-[var(--muted)]">
            Configure payroll, approvals, attendance, and leave in one place.
          </p>
        </div>

        <p className="mt-6 max-w-md text-center text-xs text-[var(--muted)]">Secure access for authorised users only.</p>
      </main>
    </div>
  );
}
