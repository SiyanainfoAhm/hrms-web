"use client";

import { cn } from "../../lib/cn";

export function OtpVerificationTemplate({
  loading = false,
  error,
  mode,
  onSubmit
}: {
  loading?: boolean;
  error?: string;
  mode: "email" | "phone";
  onSubmit?: (payload: { otp: string }) => void | Promise<void>;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onSubmit) return;
        const fd = new FormData(e.currentTarget);
        const otp = String(fd.get("otp") ?? "");
        void onSubmit({ otp });
      }}
    >
      <div className="text-sm text-gray-600">
        Enter the one-time code sent to your {mode === "email" ? "email" : "phone"}.
      </div>
      <input
        name="otp"
        inputMode="numeric"
        placeholder="123456"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        disabled={loading}
      />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={loading || !onSubmit}
        className={cn("w-full py-3 rounded-lg font-semibold transition", "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60")}
      >
        {loading ? "Verifying..." : "Verify"}
      </button>
    </form>
  );
}

