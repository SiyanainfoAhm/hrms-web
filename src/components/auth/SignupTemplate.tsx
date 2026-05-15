"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { authConfig, type AuthConfig } from "../../config/authConfig";
import { cn } from "../../lib/cn";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { LegalLinksRow } from "@/components/auth/LegalLinksRow";

const AUTH_PASSWORD_INPUT_CLASS =
  "border border-gray-200 rounded-lg bg-[var(--primary-soft)]/45 py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary)]/20";

function OrDivider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs text-slate-500">or</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function SignupTemplate({
  config = authConfig,
  loading = false,
  error,
  onEmailPasswordSignup,
  onFacebookSignup,
  onClearError,
}: {
  config?: AuthConfig;
  loading?: boolean;
  error?: string;
  onEmailPasswordSignup?: (payload: { name?: string; companyName: string; email: string; password: string }) => void | Promise<void>;
  onFacebookSignup?: () => void | Promise<void>;
  onClearError?: () => void;
}) {
  const methods = config.methods;
  const companyNameRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {methods.facebook && (
        <button
          type="button"
          onClick={() => onFacebookSignup?.()}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition shadow-sm"
          disabled={loading || !onFacebookSignup}
        >
          <span className="w-5 h-5 rounded-sm bg-gray-100 inline-flex items-center justify-center text-xs text-gray-600">
            f
          </span>
          <span className="text-gray-800 font-medium">Sign up with Facebook</span>
        </button>
      )}

      {methods.emailPassword && (
        <SignupEmailPasswordForm
          loading={loading}
          error={error}
          companyNameRef={companyNameRef}
          onEmailPasswordSignup={onEmailPasswordSignup}
          onFieldInteract={onClearError}
        />
      )}

      {methods.google && methods.emailPassword && <OrDivider />}

      {methods.google && (
        <GoogleAuthButton
          mode="signup"
          label="Sign up with Google"
          onSuccessRedirect="/app/dashboard"
          showOrDivider={false}
          onAuthStart={onClearError}
          getCompanyName={() => companyNameRef.current?.value ?? ""}
        />
      )}

      {!methods.emailPassword && !methods.google && !methods.facebook && (
        <div className="text-sm text-gray-500 text-center">
          No signup methods are enabled. Toggle them in `src/config/authConfig.ts`.
        </div>
      )}

      <p className="text-sm text-gray-500 text-center pt-2">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-[var(--primary)] hover:underline font-medium">
          Log in
        </Link>
      </p>
    </div>
  );
}

function SignupEmailPasswordForm({
  loading,
  error,
  companyNameRef,
  onEmailPasswordSignup,
  onFieldInteract,
}: {
  loading: boolean;
  error?: string;
  companyNameRef: React.RefObject<HTMLInputElement | null>;
  onEmailPasswordSignup?: (payload: { name?: string; companyName: string; email: string; password: string }) => void | Promise<void>;
  onFieldInteract?: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onEmailPasswordSignup) return;
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get("name") ?? "");
        const companyName = String(fd.get("companyName") ?? "");
        const email = String(fd.get("email") ?? "");
        void onEmailPasswordSignup({ name, companyName, email, password });
      }}
    >
      <input
        name="name"
        type="text"
        placeholder="Name (optional)"
        className="w-full rounded-lg border border-gray-200 bg-[var(--primary-soft)]/45 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
        onChange={() => onFieldInteract?.()}
      />
      <input
        ref={companyNameRef}
        name="companyName"
        type="text"
        required
        placeholder="Company name"
        className="w-full rounded-lg border border-gray-200 bg-[var(--primary-soft)]/45 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
        onChange={() => onFieldInteract?.()}
      />
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full rounded-lg border border-gray-200 bg-[var(--primary-soft)]/45 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
        onChange={() => onFieldInteract?.()}
      />
      <PasswordField
        label="Password"
        hideLabel
        name="new-password"
        value={password}
        onChange={(v) => {
          onFieldInteract?.();
          setPassword(v);
        }}
        required
        placeholder="Password"
        autoComplete="new-password"
        inputClassName={AUTH_PASSWORD_INPUT_CLASS}
        disabled={loading}
      />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <LegalLinksRow showAgreementLine className="pt-1" />

      <button
        type="submit"
        disabled={loading || !onEmailPasswordSignup}
        className={cn("w-full py-3 rounded-lg font-semibold transition", "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60")}
      >
        {loading ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
