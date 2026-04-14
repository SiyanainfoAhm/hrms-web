"use client";

import Link from "next/link";
import { authConfig, type AuthConfig } from "../../config/authConfig";
import { cn } from "../../lib/cn";

export function SignupTemplate({
  config = authConfig,
  loading = false,
  error,
  onEmailPasswordSignup,
  onGoogleSignup,
  onFacebookSignup
}: {
  config?: AuthConfig;
  loading?: boolean;
  error?: string;
  onEmailPasswordSignup?: (payload: { name?: string; email: string; password: string }) => void | Promise<void>;
  onGoogleSignup?: () => void | Promise<void>;
  onFacebookSignup?: () => void | Promise<void>;
}) {
  const methods = config.methods;

  return (
    <div className="space-y-3">
      {methods.google && (
        <button
          type="button"
          onClick={() => onGoogleSignup?.()}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition shadow-sm"
          disabled={loading || !onGoogleSignup}
        >
          <span className="w-5 h-5 rounded-sm bg-gray-100 inline-flex items-center justify-center text-xs text-gray-600">
            G
          </span>
          <span className="text-gray-800 font-medium">Sign up with Google</span>
        </button>
      )}

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
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!onEmailPasswordSignup) return;
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "");
            const email = String(fd.get("email") ?? "");
            const password = String(fd.get("password") ?? "");
            void onEmailPasswordSignup({ name, email, password });
          }}
        >
          <input
            name="name"
            type="text"
            placeholder="Name (optional)"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            disabled={loading}
          />
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
            disabled={loading || !onEmailPasswordSignup}
            className={cn("w-full py-3 rounded-lg font-semibold transition", "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60")}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
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

