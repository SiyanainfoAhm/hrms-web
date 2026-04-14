"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { SignupTemplate } from "../../../components/auth/SignupTemplate";
import { getRoleHomeHref } from "../../../config/roleHomeConfig";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with a clean, reusable app shell"
      variant="signup"
      illustrationUrl="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=60"
    >
      <SignupTemplate
        loading={loading}
        error={error}
        onGoogleSignup={async () => {
          setError(undefined);
          setLoading(true);
          try {
            localStorage.setItem("demoUser", JSON.stringify({ id: "u1", fullName: "Demo User", role: "admin" }));
            router.push(getRoleHomeHref("admin"));
          } finally {
            setLoading(false);
          }
        }}
        onEmailPasswordSignup={async ({ name, email }) => {
          setError(undefined);
          setLoading(true);
          try {
            localStorage.setItem(
              "demoUser",
              JSON.stringify({ id: "u1", fullName: name || (email.split("@")[0] || "User"), role: "admin", email })
            );
            router.push(getRoleHomeHref("admin"));
          } catch {
            setError("Signup failed.");
          } finally {
            setLoading(false);
          }
        }}
      />
    </AuthLayout>
  );
}

