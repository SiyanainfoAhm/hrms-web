"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { LoginTemplate } from "../../../components/auth/LoginTemplate";
import { getRoleHomeHref } from "../../../config/roleHomeConfig";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue"
      variant="login"
    >
      <LoginTemplate
        loading={loading}
        error={error}
        onGoogleLogin={async () => {
          setError(undefined);
          setLoading(true);
          try {
            // Demo-only: replace with real OAuth flow later.
            localStorage.setItem(
              "demoUser",
              JSON.stringify({ id: "u1", fullName: "Demo User", role: "admin" })
            );
            router.push(getRoleHomeHref("admin"));
          } finally {
            setLoading(false);
          }
        }}
        onEmailPasswordLogin={async ({ email }) => {
          setError(undefined);
          setLoading(true);
          try {
            // Demo-only: wire to your backend using `authConfig.endpoints.login`.
            localStorage.setItem(
              "demoUser",
              JSON.stringify({ id: "u1", fullName: email.split("@")[0] || "User", role: "admin", email })
            );
            router.push(getRoleHomeHref("admin"));
          } catch {
            setError("Login failed.");
          } finally {
            setLoading(false);
          }
        }}
        onNavigateForgot={() => router.push("/auth/forgot-password")}
      />
    </AuthLayout>
  );
}

