"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/ToastProvider";
import { SkeletonText } from "@/components/common/Skeleton";
import {
  type AgentSettings,
  type ScreenshotIntervalSeconds,
  normalizeScreenshotIntervalSeconds,
} from "@/lib/agentSettings";
import { getAgentSettings, upsertAgentSettings } from "@/services/agentSettingsService";
import { useHrmsSession } from "@/hooks/useHrmsSession";

const SCREENSHOT_OPTIONS: { value: ScreenshotIntervalSeconds; label: string }[] = [
  { value: 300, label: "5 minutes (300 seconds) — recommended" },
  { value: 60, label: "1 minute (60 seconds)" },
];

export function DesktopAgentSettingsPanel() {
  const { role } = useHrmsSession();
  const { showToast } = useToast();
  const isSuperAdmin = role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);

  const [screenshotIntervalSeconds, setScreenshotIntervalSeconds] = useState<ScreenshotIntervalSeconds>(300);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAgentSettings();
      setSettings(data);
      setScreenshotIntervalSeconds(normalizeScreenshotIntervalSeconds(data.screenshotIntervalSeconds));
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin) {
      showToast("error", "Only Super Admin can update desktop agent settings.");
      return;
    }

    const companyId = settings?.companyId ?? "";
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertAgentSettings(companyId, {
        screenshotIntervalSeconds,
        isActive,
      });
      setSettings(saved);
      setScreenshotIntervalSeconds(normalizeScreenshotIntervalSeconds(saved.screenshotIntervalSeconds));
      showToast("success", "Desktop agent settings saved");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save desktop agent settings";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="card">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Desktop Agent Settings</h2>
        <p className="muted text-sm">
          Control how often desktop agents capture screenshots while attendance is active. Five minutes is the
          recommended interval for normal monitoring.
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
            Active agents check for setting changes every 60 seconds. Screenshot captures use the interval above
            (5 minutes is recommended).
          </p>

          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
