import type { Metadata } from "next";
import { AccountDeletionRequestForm } from "./AccountDeletionRequestForm";
import { legalConfig } from "@/lib/legal/legalConfig";

export const metadata: Metadata = {
  title: "Account deletion | HRMS",
  description: "Request deletion of your HRMS account and personal data.",
  robots: { index: true, follow: true },
};

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/auth/login" className="text-sm font-semibold text-[var(--primary)] hover:underline">
            ← Sign in
          </a>
          <span className="text-sm font-bold text-[var(--primary)]">{legalConfig.appName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight">Request account deletion</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Sign in with your work email and password to submit a deletion request. Your app access is revoked
          immediately. Personal data is scheduled for deletion within <strong>90 days</strong>, subject to legal
          retention requirements below.
        </p>

        <AccountDeletionRequestForm />

        <section className="mt-10 space-y-3 border-t border-[var(--border)] pt-8 text-sm leading-relaxed text-[var(--muted)]">
          <h2 className="text-base font-semibold text-[var(--text)]">Retention notice</h2>
          <p>
            HRMS accounts are employment/workplace accounts. Certain records such as attendance, leave, payroll,
            reimbursement, audit logs, and statutory employment records may be retained where required for legal,
            payroll, tax, security, fraud-prevention, audit, or employer compliance purposes.
          </p>
          <p>
            Upon request, we deactivate app access and delete or anonymise personal data where legally and
            operationally permitted.
          </p>
          <p>
            Questions:{" "}
            <a href={`mailto:${legalConfig.contactEmail}`} className="font-semibold text-[var(--primary)] hover:underline">
              {legalConfig.contactEmail}
            </a>
          </p>
          <p className="text-xs">
            <a href="/privacy" className="text-[var(--primary)] hover:underline">
              Privacy Policy
            </a>
            {" · "}
            <a href="/terms" className="text-[var(--primary)] hover:underline">
              Terms and Conditions
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
