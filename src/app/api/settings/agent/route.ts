import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import {
  agentSettingsRowFromPayload,
  mapAgentSettingsRow,
  resolveDefaultAgentSettings,
  validateAgentSettingsPayload,
} from "@/lib/agentSettings";

function isSuperAdmin(role: string): boolean {
  return role === "super_admin";
}

async function getCompanyIdForSession(userId: string): Promise<string | null> {
  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (meErr) throw new Error(meErr.message);
  return me?.company_id ? String(me.company_id) : null;
}

async function fetchAgentSettingsRow(companyId: string) {
  const { data, error } = await supabase
    .from("HRMS_agent_settings")
    .select("id, company_id, screenshot_interval_seconds, min_allowed_interval_seconds, is_active, created_at, updated_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureAgentSettings(companyId: string) {
  const existing = await fetchAgentSettingsRow(companyId);
  if (existing) return existing;

  const defaults = resolveDefaultAgentSettings(companyId);
  const row = agentSettingsRowFromPayload(companyId, {
    screenshotIntervalSeconds: defaults.screenshotIntervalSeconds,
    isActive: defaults.isActive,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("HRMS_agent_settings")
    .insert(row)
    .select("id, company_id, screenshot_interval_seconds, min_allowed_interval_seconds, is_active, created_at, updated_at")
    .maybeSingle();

  if (insertErr) {
    const raced = await fetchAgentSettingsRow(companyId);
    if (raced) return raced;
    throw new Error(insertErr.message);
  }

  return inserted ?? (await fetchAgentSettingsRow(companyId));
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const companyId = await getCompanyIdForSession(session.id);
    if (!companyId) {
      return NextResponse.json({ settings: resolveDefaultAgentSettings("") });
    }

    const row = await ensureAgentSettings(companyId);
    return NextResponse.json({ settings: mapAgentSettingsRow(row as any, companyId) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load agent settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const validated = validateAgentSettingsPayload(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const companyId = await getCompanyIdForSession(session.id);
    if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

    const row = agentSettingsRowFromPayload(companyId, validated.value);
    const { error } = await supabase.from("HRMS_agent_settings").upsert([row], { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const saved = await fetchAgentSettingsRow(companyId);
    return NextResponse.json({ ok: true, settings: mapAgentSettingsRow(saved as any, companyId) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save agent settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
