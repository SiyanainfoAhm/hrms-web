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
      subtitle="Use your work email to get started. You can complete your profile after signing in."
      variant="signup"
    >
      <SignupTemplate
        loading={loading}
        error={error}
        onEmailPasswordSignup={async ({ name, companyName, email }) => {
          setError(undefined);
          setLoading(true);
          try {
            localStorage.setItem(
              "demoUser",
              JSON.stringify({
                id: "u1",
                fullName: name || (email.split("@")[0] || "User"),
                role: "admin",
                email,
                companyName,
              })
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

