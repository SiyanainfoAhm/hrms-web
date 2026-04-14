"use client";

import { cn } from "../../lib/cn";

export function ForgotPasswordTemplate({
  loading = false,
  error,
  onSubmit
}: {
  loading?: boolean;
  error?: string;
  onSubmit?: (payload: { email: string }) => void | Promise<void>;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onSubmit) return;
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") ?? "");
        void onSubmit({ email });
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
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={loading || !onSubmit}
        className={cn("w-full py-3 rounded-lg font-semibold transition", "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60")}
      >
        {loading ? "Sending..." : "Send reset link"}
      </button>
      <p className="text-xs text-gray-400 text-center">
        Hook this to your backend later using `authConfig.endpoints.forgotPassword`.
      </p>
    </form>
  );
}

