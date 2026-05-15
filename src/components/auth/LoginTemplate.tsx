"use client";

import Link from "next/link";
import { useState } from "react";
import { authConfig, type AuthConfig } from "../../config/authConfig";
import { cn } from "../../lib/cn";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { PasswordField } from "@/components/auth/PasswordField";

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

export function LoginTemplate({
  config = authConfig,
  loading = false,
  error,
  onEmailPasswordLogin,
  onFacebookLogin,
  onNavigateForgot,
  onClearError,
}: {
  config?: AuthConfig;
  loading?: boolean;
  error?: string;
  onEmailPasswordLogin?: (payload: { email: string; password: string }) => void | Promise<void>;
  onFacebookLogin?: () => void | Promise<void>;
  onNavigateForgot?: () => void;
  /** Clears email/password login errors when the user switches method or edits fields. */
  onClearError?: () => void;
}) {
  const methods = config.methods;

  return (
    <div className="space-y-3">
      {methods.facebook && (
        <button
          type="button"
          onClick={() => onFacebookLogin?.()}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition shadow-sm"
          disabled={loading || !onFacebookLogin}
        >
          <span className="w-5 h-5 rounded-sm bg-gray-100 inline-flex items-center justify-center text-xs text-gray-600">
            f
          </span>
          <span className="text-gray-800 font-medium">Log in with Facebook</span>
        </button>
      )}

      {methods.google && (
        <GoogleAuthButton
          mode="login"
          onSuccessRedirect="/app/dashboard"
          showOrDivider={false}
          onAuthStart={onClearError}
        />
      )}

      {methods.google && methods.emailPassword && <OrDivider />}

      {methods.emailPassword && (
        <EmailPasswordForm
          loading={loading}
          error={error}
          onSubmit={onEmailPasswordLogin}
          showForgot={methods.forgotPassword}
          onNavigateForgot={onNavigateForgot}
          onFieldInteract={onClearError}
        />
      )}

      {!methods.emailPassword && !methods.google && !methods.facebook && (
        <div className="text-sm text-gray-500 text-center">
          No login methods are enabled. Toggle them in `src/config/authConfig.ts`.
        </div>
      )}

      <p className="text-sm text-gray-500 text-center pt-2">
        Don&apos;t have an account?{" "}
        <Link href="/auth/signup" className="text-[var(--primary)] hover:underline font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function EmailPasswordForm({
  loading,
  error,
  onSubmit,
  showForgot,
  onNavigateForgot,
  onFieldInteract,
}: {
  loading: boolean;
  error?: string;
  onSubmit?: (payload: { email: string; password: string }) => void | Promise<void>;
  showForgot: boolean;
  onNavigateForgot?: () => void;
  onFieldInteract?: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onSubmit) return;
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") ?? "");
        void onSubmit({ email, password });
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full rounded-lg border border-gray-200 bg-[var(--primary-soft)]/45 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
        onChange={() => onFieldInteract?.()}
        onFocus={() => onFieldInteract?.()}
      />
      <PasswordField
        label="Password"
        hideLabel
        name="password"
        value={password}
        onChange={(v) => {
          onFieldInteract?.();
          setPassword(v);
        }}
        required
        placeholder="Password"
        autoComplete="current-password"
        inputClassName={AUTH_PASSWORD_INPUT_CLASS}
        disabled={loading}
      />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <button
        type="submit"
        disabled={loading || !onSubmit}
        className={cn(
          "w-full py-3 rounded-lg font-semibold transition",
          "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60"
        )}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      {showForgot && (
        <button
          type="button"
          className="w-full text-sm text-gray-500 hover:underline"
          onClick={() => {
            onFieldInteract?.();
            onNavigateForgot?.();
          }}
        >
          Forgot password?
        </button>
      )}
    </form>
  );
}
