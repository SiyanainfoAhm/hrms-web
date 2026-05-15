"use client";

import { FormEvent, useState } from "react";
import { PasswordField } from "@/components/auth/PasswordField";

export function AccountDeletionRequestForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ scheduledDeletionAt: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!confirm) {
      setError("Please confirm that you understand the 90-day deletion process.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setSuccess({ scheduledDeletionAt: String(data.scheduledDeletionAt || "") });
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    const when = success.scheduledDeletionAt
      ? new Date(success.scheduledDeletionAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "within 90 days";

    return (
      <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-semibold">Request received</p>
        <p className="mt-2 leading-relaxed">
          Your account access has been revoked. Personal data is scheduled for deletion by{" "}
          <strong>{when}</strong> (or sooner when processed by your company super admin), except records we must
          keep by law.
        </p>
        <a href="/auth/login" className="mt-4 inline-block font-semibold text-[var(--primary)] hover:underline">
          Return to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Work email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-[var(--primary-soft)]/45 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          placeholder="you@company.com"
          disabled={busy}
        />
      </div>

      <PasswordField
        label="Password"
        name="password"
        value={password}
        onChange={setPassword}
        required
        placeholder="Your account password"
        autoComplete="current-password"
        disabled={busy}
        inputClassName="border border-gray-200 rounded-lg bg-[var(--primary-soft)]/45 py-2.5 text-sm focus:ring-2 focus:ring-[var(--primary)]/20"
      />

      <label className="flex items-start gap-3 text-sm leading-relaxed text-[var(--muted)]">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-1"
          disabled={busy}
        />
        <span>
          I understand my HRMS access will end immediately and my personal data will be deleted within 90 days,
          except where retention is required by law or employer policy.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Submit deletion request"}
      </button>

      <p className="text-xs text-[var(--muted)]">
        Google-only accounts cannot use this form. Contact{" "}
        <a href="mailto:support@siyanainfo.com" className="text-[var(--primary)] hover:underline">
          support@siyanainfo.com
        </a>
        .
      </p>
    </form>
  );
}
