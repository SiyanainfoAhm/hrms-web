"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { LoginTemplate } from "../../../components/auth/LoginTemplate";
import type { RoleId } from "../../../config/roleConfig";
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
        onEmailPasswordLogin={async ({ email, password }) => {
          setError(undefined);
          setLoading(true);
          try {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ email, password })
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string; user?: { id: string; email: string; name: string | null; role: string } };
            if (!res.ok) {
              setError(data?.error || "Login failed.");
              return;
            }
            const u = data.user;
            if (u) {
              localStorage.setItem(
                "demoUser",
                JSON.stringify({
                  id: u.id,
                  email: u.email,
                  fullName: u.name || u.email.split("@")[0] || "User",
                  role: u.role
                })
              );
              router.push(getRoleHomeHref(u.role as RoleId));
            }
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

