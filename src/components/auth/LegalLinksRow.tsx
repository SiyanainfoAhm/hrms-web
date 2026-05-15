import Link from "next/link";
import { cn } from "@/lib/cn";

export function LegalLinksRow({
  center = true,
  showAgreementLine = false,
  className,
}: {
  center?: boolean;
  showAgreementLine?: boolean;
  className?: string;
}) {
  const align = center ? "text-center" : "text-left";

  if (showAgreementLine) {
    return (
      <p className={cn("text-xs leading-relaxed text-[var(--muted)]", align, className)}>
        By creating an account, you agree to our{" "}
        <Link href="/terms" className="font-semibold text-[var(--primary)] hover:underline">
          Terms and Conditions
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-[var(--primary)] hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    );
  }

  return (
    <p className={cn("text-xs text-[var(--muted)]", align, className)}>
      <Link href="/privacy" className="font-semibold text-[var(--primary)] hover:underline">
        Privacy Policy
      </Link>
      <span className="mx-2">·</span>
      <Link href="/terms" className="font-semibold text-[var(--primary)] hover:underline">
        Terms and Conditions
      </Link>
    </p>
  );
}
