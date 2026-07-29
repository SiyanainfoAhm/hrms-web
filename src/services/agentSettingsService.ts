import {
  type AgentSettings,
  type AgentSettingsUpsertPayload,
  resolveDefaultAgentSettings,
} from "@/lib/agentSettings";
import { hrmsJson } from "@/lib/hrmsJson";

export type { AgentSettings, AgentSettingsUpsertPayload };
export { resolveDefaultAgentSettings };

export async function getAgentSettings(_companyId?: string): Promise<AgentSettings> {
  const data = await hrmsJson<{ settings: AgentSettings }>("/api/settings/agent", {
    cache: "no-store",
  });
  return data.settings;
}

export async function upsertAgentSettings(
  _companyId: string,
  payload: AgentSettingsUpsertPayload,
): Promise<AgentSettings> {
  const data = await hrmsJson<{ settings: AgentSettings }>("/api/settings/agent", {
    method: "PUT",
    json: payload,
  });
  return data.settings;
}
