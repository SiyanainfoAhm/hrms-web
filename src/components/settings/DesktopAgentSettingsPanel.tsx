"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/ToastProvider";
import { SkeletonText } from "@/components/common/Skeleton";
import {
  type AgentSettings,
  type ScreenshotIntervalSeconds,
  type MinAllowedIntervalSeconds,
} from "@/lib/agentSettings";
import { getAgentSettings, upsertAgentSettings } from "@/services/agentSettingsService";
import { useHrmsSession } from "@/hooks/useHrmsSession";

const SCREENSHOT_OPTIONS: { value: ScreenshotIntervalSeconds; label: string }[] = [
  { value: 300, label: "5 minutes (300 seconds)" },
  { value: 180, label: "3 minutes (180 seconds)" },
  { value: 60, label: "1 minute (60 seconds)" },
  { value: 30, label: "30 seconds" },
];

const MIN_INTERVAL_OPTIONS: { value: MinAllowedIntervalSeconds; label: string }[] = [
  { value: 60, label: "1 minute (recommended)" },
  { value: 30, label: "30 seconds (strict mode)" },
];

export function DesktopAgentSettingsPanel() {
  const { role } = useHrmsSession();
  const { showToast } = useToast();
  const isSuperAdmin = role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [confirm30Open, setConfirm30Open] = useState(false);

  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = useState<ScreenshotIntervalSeconds>(300);
  const [minAllowedIntervalSeconds, setMinAllowedIntervalSeconds] = useState<MinAllowedIntervalSeconds>(60);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAgentSettings();
      setSettings(data);
      setScreenshotIntervalSeconds(data.screenshotIntervalSeconds);
      setMinAllowedIntervalSeconds(data.minAllowedIntervalSeconds);
      setIsActive(data.isActive);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load desktop agent settings");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persistSettings() {
    if (!isSuperAdmin) {
      showToast("error", "Only Super Admin can update desktop agent settings.");
      return;
    }
    if (screenshotIntervalSeconds < minAllowedIntervalSeconds) {
      const msg = "Screenshot interval cannot be shorter than the minimum allowed interval.";
      setError(msg);
      showToast("error", msg);
      return;
    }

    const companyId = settings?.companyId ?? "";
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertAgentSettings(companyId, {
        screenshotIntervalSeconds,
        minAllowedIntervalSeconds,
        isActive,
      });
      setSettings(saved);
      showToast("success", "Desktop agent settings saved");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save desktop agent settings";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin) return;
    if (screenshotIntervalSeconds === 30) {
      setConfirm30Open(true);
      return;
    }
    void persistSettings();
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <>
      <div className="card">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Desktop Agent Settings</h2>
          <p className="muted text-sm">
            Control how often desktop agents capture screenshots for your company.
          </p>
        </div>

        {loading ? (
          <div className="mt-4">
            <SkeletonText lines={5} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-5">
            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <label className="block text-sm">
              <span className="text-slate-600">Screenshot interval</span>
              <select
                className="mt-1 w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={screenshotIntervalSeconds}
                onChange={(e) => setScreenshotIntervalSeconds(Number(e.target.value) as ScreenshotIntervalSeconds)}
              >
                {SCREENSHOT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-slate-600">Minimum allowed interval</span>
              <select
                className="mt-1 w-full max-w-md rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={minAllowedIntervalSeconds}
                onChange={(e) =>
                  setMinAllowedIntervalSeconds(Number(e.target.value) as MinAllowedIntervalSeconds)
                }
              >
                {MIN_INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active (desktop agents use these settings when enabled)
            </label>

            <p className="text-xs text-slate-500">
              Desktop agents check this setting periodically. Changes may take up to 60 seconds to apply on active
              agents.
            </p>

            <div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={confirm30Open}
        title="Confirm 30-second screenshot interval"
        description="30 seconds can increase Azure storage, upload bandwidth, Supabase rows, and employee system load, especially for users with multiple monitors. Use only when strict monitoring is required."
        confirmText="Confirm and Save"
        cancelText="Cancel"
        danger
        loading={saving}
        onClose={() => setConfirm30Open(false)}
        onConfirm={async () => {
          await persistSettings();
          setConfirm30Open(false);
        }}
      />
    </>
  );
}
