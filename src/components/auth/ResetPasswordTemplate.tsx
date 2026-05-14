"use client";

import { useState } from "react";
import { PasswordField } from "@/components/auth/PasswordField";
import { cn } from "../../lib/cn";

export function ResetPasswordTemplate({
  loading = false,
  error,
  onSubmit
}: {
  loading?: boolean;
  error?: string;
  onSubmit?: (payload: { password: string }) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!onSubmit) return;
        void onSubmit({ password });
      }}
    >
      <PasswordField
        label="New password"
        hideLabel
        name="new-password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        placeholder="New password (min 8 characters)"
        autoComplete="new-password"
        disabled={loading}
        inputClassName="border border-gray-300 rounded-lg py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary)]/20"
      />
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={loading || !onSubmit}
        className={cn("w-full py-3 rounded-lg font-semibold transition", "bg-[var(--primary)] text-white hover:brightness-95 disabled:opacity-60")}
      >
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}

