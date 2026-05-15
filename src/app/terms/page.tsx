import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Terms and Conditions | HRMS",
  description: "Terms and Conditions for the HRMS mobile and web applications.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalDocumentView kind="terms" />;
}
