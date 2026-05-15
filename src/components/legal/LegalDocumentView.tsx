import Link from "next/link";
import { legalConfig } from "@/lib/legal/legalConfig";
import {
  effectiveDateFor,
  introFor,
  sectionsFor,
  titleFor,
  type LegalDocumentKind,
} from "@/lib/legal/legalDocuments";

export function LegalDocumentView({ kind }: { kind: LegalDocumentKind }) {
  const title = titleFor(kind);
  const effective = effectiveDateFor(kind);
  const intro = introFor(kind);
  const sections = sectionsFor(kind);
  const other = kind === "privacy" ? { href: "/terms", label: "Terms and Conditions" } : { href: "/privacy", label: "Privacy Policy" };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/auth/login" className="text-sm font-semibold text-[var(--primary)] hover:underline">
            ← Back to sign in
          </Link>
          <span className="text-sm font-bold text-[var(--primary)]">{legalConfig.appName}</span>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Last updated: {effective}</p>
        <p className="mt-6 text-sm leading-relaxed sm:text-base">{intro}</p>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-bold sm:text-lg">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((p) => (
                  <p key={p.slice(0, 48)} className="text-sm leading-relaxed text-[var(--text)] sm:text-base">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
          <Link href={other.href} className="font-semibold text-[var(--primary)] hover:underline">
            {other.label}
          </Link>
          <p className="mt-4">
            {legalConfig.legalEntityName}
            <br />
            {legalConfig.registeredAddress}
            <br />
            <a href={`mailto:${legalConfig.contactEmail}`} className="text-[var(--primary)] hover:underline">
              {legalConfig.contactEmail}
            </a>
          </p>
        </footer>
      </article>
    </div>
  );
}
