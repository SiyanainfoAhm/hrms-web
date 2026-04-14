"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { OtpVerificationTemplate } from "../../../components/auth/OtpVerificationTemplate";

function VerifyOtpInner() {
  const sp = useSearchParams();
  const mode = (sp.get("mode") === "phone" ? "phone" : "email") as "email" | "phone";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <AuthLayout title="Verify code" subtitle="One-time verification" variant="neutral">
      <OtpVerificationTemplate
        mode={mode}
        loading={loading}
        error={error}
        onSubmit={async ({ otp }) => {
          setError(undefined);
          setLoading(true);
          try {
            if (otp.trim().length < 4) throw new Error("Invalid code");
            // Demo-only.
          } catch {
            setError("Invalid code.");
          } finally {
            setLoading(false);
          }
        }}
      />
    </AuthLayout>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <VerifyOtpInner />
    </Suspense>
  );
}

