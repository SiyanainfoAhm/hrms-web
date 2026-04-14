"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { ResetPasswordTemplate } from "../../../components/auth/ResetPasswordTemplate";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <AuthLayout title="Reset password" subtitle="Set a new password" variant="neutral">
      <ResetPasswordTemplate
        loading={loading}
        error={error}
        onSubmit={async () => {
          setError(undefined);
          setLoading(true);
          try {
            router.push("/auth/login");
          } catch {
            setError("Reset failed.");
          } finally {
            setLoading(false);
          }
        }}
      />
    </AuthLayout>
  );
}

