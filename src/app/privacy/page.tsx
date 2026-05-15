import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "Privacy Policy | HRMS",
  description: "Privacy Policy for the HRMS mobile and web applications.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return <LegalDocumentView kind="privacy" />;
}
