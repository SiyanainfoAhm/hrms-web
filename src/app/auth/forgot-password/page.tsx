"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { ForgotPasswordTemplate } from "../../../components/auth/ForgotPasswordTemplate";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <AuthLayout title="Forgot password" subtitle="We’ll send you a reset link" variant="neutral">
      <ForgotPasswordTemplate
        loading={loading}
        error={error}
        onSubmit={async () => {
          setError(undefined);
          setLoading(true);
          try {
            // Demo-only: redirect to reset screen.
            router.push("/auth/reset-password");
          } finally {
            setLoading(false);
          }
        }}
      />
    </AuthLayout>
  );
}

