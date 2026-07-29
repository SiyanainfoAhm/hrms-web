export const SCREENSHOT_INTERVAL_SECONDS_OPTIONS = [300, 60] as const;
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

export function normalizeScreenshotIntervalSeconds(value: number): ScreenshotIntervalSeconds {
  if (SCREENSHOT_INTERVAL_SECONDS_OPTIONS.includes(value as ScreenshotIntervalSeconds)) {
    return value as ScreenshotIntervalSeconds;
  }
  return 300;
}

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
    screenshotIntervalSeconds: normalizeScreenshotIntervalSeconds(row.screenshot_interval_seconds),
    minAllowedIntervalSeconds: row.min_allowed_interval_seconds as MinAllowedIntervalSeconds,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deriveMinAllowedIntervalSeconds(
  _screenshotIntervalSeconds: ScreenshotIntervalSeconds,
): MinAllowedIntervalSeconds {
  return 60;
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
  const screenshotIntervalSeconds = payload.screenshotIntervalSeconds as ScreenshotIntervalSeconds;
  return {
    company_id: companyId,
    screenshot_interval_seconds: screenshotIntervalSeconds,
    min_allowed_interval_seconds: deriveMinAllowedIntervalSeconds(screenshotIntervalSeconds),
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
  const isActive = raw.isActive ?? raw.is_active;

  if (!SCREENSHOT_INTERVAL_SECONDS_OPTIONS.includes(screenshotIntervalSeconds as ScreenshotIntervalSeconds)) {
    return { ok: false, error: "Screenshot interval must be 300 or 60 seconds." };
  }
  if (typeof isActive !== "boolean") {
    return { ok: false, error: "Active flag must be true or false." };
  }

  const interval = screenshotIntervalSeconds as ScreenshotIntervalSeconds;

  return {
    ok: true,
    value: {
      screenshotIntervalSeconds: interval,
      isActive,
    },
  };
}
