"use client";

import Link from "next/link";
import { authConfig, type AuthConfig } from "../../config/authConfig";
import { cn } from "../../lib/cn";

export function LoginTemplate({
  config = authConfig,
  loading = false,
  error,
  onEmailPasswordLogin,
  onGoogleLogin,
  onFacebookLogin,
  onNavigateForgot
}: {
  config?: AuthConfig;
  loading?: boolean;
  error?: string;
  onEmailPasswordLogin?: (payload: { email: string; password: string }) => void | Promise<void>;
  onGoogleLogin?: () => void | Promise<void>;
  onFacebookLogin?: () => void | Promise<void>;
  onNavigateForgot?: () => void;
}) {
  const methods = config.methods;

  return (
    <div className="space-y-3">
      {methods.google && (
        <button
          type="button"
          onClick={() => onGoogleLogin?.()}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition shadow-sm"
          disabled={loading || !onGoogleLogin}
        >
          <span className="w-5 h-5 rounded-sm bg-gray-100 inline-flex items-center justify-center text-xs text-gray-600">
            G
          </span>
          <span className="text-gray-800 font-medium">Log in with Google</span>
        </button>
      )}

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

      {methods.emailPassword && (
        <EmailPasswordForm
          loading={loading}
          error={error}
          onSubmit={onEmailPasswordLogin}
          showForgot={methods.forgotPassword}
          onNavigateForgot={onNavigateForgot}
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
  onNavigateForgot
}: {
  loading: boolean;
  error?: string;
  onSubmit?: (payload: { email: string; password: string }) => void | Promise<void>;
  showForgot: boolean;
  onNavigateForgot?: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onSubmit) return;
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") ?? "");
        const password = String(fd.get("password") ?? "");
        void onSubmit({ email, password });
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
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
          onClick={onNavigateForgot}
        >
          Forgot password?
        </button>
      )}
    </form>
  );
}

