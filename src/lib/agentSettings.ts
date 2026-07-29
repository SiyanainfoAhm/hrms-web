export const SCREENSHOT_INTERVAL_SECONDS_OPTIONS = [300, 180, 60, 30] as const;
export const MIN_ALLOWED_INTERVAL_SECONDS_OPTIONS = [60, 30] as const;

export type ScreenshotIntervalSeconds = (typeof SCREENSHOT_INTERVAL_SECONDS_OPTIONS)[number];
export type MinAllowedIntervalSeconds = (typeof MIN_ALLOWED_INTERVAL_SECONDS_OPTIONS)[number];

export type AgentSettings = {
  id?: string;
  companyId: string;
  screenshotIntervalSeconds: ScreenshotIntervalSeconds;
  minAllowedIntervalSeconds: MinAllowedIntervalSeconds;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AgentSettingsUpsertPayload = {
  screenshotIntervalSeconds: number;
  minAllowedIntervalSeconds: number;
  isActive: boolean;
};

type AgentSettingsRow = {
  id: string;
  company_id: string;
  screenshot_interval_seconds: number;
  min_allowed_interval_seconds: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export function resolveDefaultAgentSettings(companyId: string): AgentSettings {
  return {
    companyId,
    screenshotIntervalSeconds: 300,
    minAllowedIntervalSeconds: 60,
    isActive: true,
  };
}

export function mapAgentSettingsRow(row: AgentSettingsRow | null, companyId: string): AgentSettings {
  if (!row) return resolveDefaultAgentSettings(companyId);
  return {
    id: row.id,
    companyId: row.company_id,
    screenshotIntervalSeconds: row.screenshot_interval_seconds as ScreenshotIntervalSeconds,
    minAllowedIntervalSeconds: row.min_allowed_interval_seconds as MinAllowedIntervalSeconds,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function agentSettingsRowFromPayload(
  companyId: string,
  payload: AgentSettingsUpsertPayload,
): {
  company_id: string;
  screenshot_interval_seconds: number;
  min_allowed_interval_seconds: number;
  is_active: boolean;
  updated_at: string;
} {
  return {
    company_id: companyId,
    screenshot_interval_seconds: payload.screenshotIntervalSeconds,
    min_allowed_interval_seconds: payload.minAllowedIntervalSeconds,
    is_active: payload.isActive,
    updated_at: new Date().toISOString(),
  };
}

export function validateAgentSettingsPayload(
  payload: unknown,
): { ok: true; value: AgentSettingsUpsertPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid payload" };
  }

  const raw = payload as Record<string, unknown>;
  const screenshotIntervalSeconds = Number(
    raw.screenshotIntervalSeconds ?? raw.screenshot_interval_seconds,
  );
  const minAllowedIntervalSeconds = Number(
    raw.minAllowedIntervalSeconds ?? raw.min_allowed_interval_seconds,
  );
  const isActive = raw.isActive ?? raw.is_active;

  if (!SCREENSHOT_INTERVAL_SECONDS_OPTIONS.includes(screenshotIntervalSeconds as ScreenshotIntervalSeconds)) {
    return { ok: false, error: "Screenshot interval must be 300, 180, 60, or 30 seconds." };
  }
  if (!MIN_ALLOWED_INTERVAL_SECONDS_OPTIONS.includes(minAllowedIntervalSeconds as MinAllowedIntervalSeconds)) {
    return { ok: false, error: "Minimum allowed interval must be 60 or 30 seconds." };
  }
  if (screenshotIntervalSeconds < minAllowedIntervalSeconds) {
    return {
      ok: false,
      error: "Screenshot interval cannot be shorter than the minimum allowed interval.",
    };
  }
  if (typeof isActive !== "boolean") {
    return { ok: false, error: "Active flag must be true or false." };
  }

  return {
    ok: true,
    value: {
      screenshotIntervalSeconds,
      minAllowedIntervalSeconds,
      isActive,
    },
  };
}
