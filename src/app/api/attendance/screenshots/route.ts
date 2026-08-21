import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getScreenshotUrl,
  getScreenshotUrlSource,
  inlineScreenshotUrl,
  isAbsoluteHttpUrl,
  pickScreenshotUrlFields,
  type ScreenshotUrlSource,
} from "@/lib/attendanceScreenshotUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/attendance/screenshots?logId=<HRMS_attendance_logs.id>
 *
 * Returns the desktop-agent screenshots captured against the given
 * attendance log. Restricted to managerial roles (super_admin / admin / hr)
 * because raw activity media is sensitive. The handler also enforces
 * company scope: an HR/admin from company A cannot read screenshots
 * stored against a log that belongs to company B.
 *
 * URL resolution (migration-safe):
 *   file_url → storage_path (if http) → file_path (if http) →
 *   signed/public URL from storage_bucket + object key
 */
function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerial(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const logId = (searchParams.get("logId") || "").trim();
  if (!logId) {
    return NextResponse.json({ error: "logId is required" }, { status: 400 });
  }

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ screenshots: [] });

  const { data: log, error: logErr } = await supabase
    .from("HRMS_attendance_logs")
    .select("id, company_id, employee_id")
    .eq("id", logId)
    .maybeSingle();
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });
  if (!log || String(log.company_id) !== String(me.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rows: any[] | null = null;
  {
    // Filter by attendance_log_id (session). Log already company-scoped above.
    const full = await supabaseAdmin
      .from("HRMS_activity_screenshots")
      .select(
        "id, captured_at, trigger_type, storage_bucket, storage_path, file_url, file_path, app_name, window_title, mouse_active, keyboard_active, idle_seconds",
      )
      .eq("attendance_log_id", logId)
      .order("captured_at", { ascending: true });

    if (full.error && /file_url|file_path|column/i.test(String(full.error.message || ""))) {
      const fallback = await supabaseAdmin
        .from("HRMS_activity_screenshots")
        .select(
          "id, captured_at, trigger_type, storage_bucket, storage_path, app_name, window_title, mouse_active, keyboard_active, idle_seconds",
        )
        .eq("attendance_log_id", logId)
        .order("captured_at", { ascending: true });
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 400 });
      }
      rows = fallback.data;
    } else if (full.error) {
      return NextResponse.json({ error: full.error.message }, { status: 400 });
    } else {
      rows = full.data;
    }
  }

  type ItemRef = { id: string; path: string; bucket: string; source: ScreenshotUrlSource };
  const toSign: ItemRef[] = [];
  const urlByRowId = new Map<string, string>();
  const sourceByRowId = new Map<string, ScreenshotUrlSource>();

  for (const r of rows ?? []) {
    const id = String((r as any).id);
    const source = getScreenshotUrlSource(r as any);
    sourceByRowId.set(id, source);

    const direct = getScreenshotUrl(r as any);
    if (direct && isAbsoluteHttpUrl(direct)) {
      urlByRowId.set(id, direct);
      continue;
    }

    const picked = pickScreenshotUrlFields(r as any);
    if (picked.url && isAbsoluteHttpUrl(picked.url)) {
      urlByRowId.set(id, picked.url);
      continue;
    }

    if (picked.objectKey) {
      toSign.push({
        id,
        path: picked.objectKey,
        bucket: picked.bucket,
        source: picked.source,
      });
    }
  }

  const byBucket = new Map<string, ItemRef[]>();
  for (const item of toSign) {
    const list = byBucket.get(item.bucket) ?? [];
    list.push(item);
    byBucket.set(item.bucket, list);
  }

  for (const [bucket, items] of byBucket.entries()) {
    if (!items.length) continue;
    const paths = items.map((i) => i.path);
    const { data: signed } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (Array.isArray(signed)) {
      signed.forEach((s, idx) => {
        const raw = s as { signedUrl?: string | null; signedURL?: string | null };
        const u = raw?.signedUrl ?? raw?.signedURL;
        if (u) urlByRowId.set(items[idx].id, u);
      });
    }
    for (const item of items) {
      if (urlByRowId.has(item.id)) continue;
      const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(item.path);
      if (pub?.publicUrl) urlByRowId.set(item.id, pub.publicUrl);
    }
  }

  const screenshots = (rows ?? [])
    .map((r: any) => {
      const id = String(r.id);
      const url = urlByRowId.get(id);
      if (!url) return null;
      const item: Record<string, unknown> = {
        id,
        capturedAt: r.captured_at ? new Date(r.captured_at).toISOString() : null,
        triggerType: r.trigger_type ?? null,
        appName: r.app_name ?? null,
        windowTitle: r.window_title ?? null,
        mouseActive: Boolean(r.mouse_active),
        keyboardActive: Boolean(r.keyboard_active),
        idleSeconds: Number(r.idle_seconds) || 0,
        url: inlineScreenshotUrl(url),
      };
      if (process.env.NODE_ENV === "development") {
        item.urlSource = sourceByRowId.get(id) ?? null;
      }
      return item;
    })
    .filter(Boolean);

  if (process.env.NODE_ENV === "development") {
    const sourceTally: Record<string, number> = {};
    for (const s of screenshots as any[]) {
      const src = String(s.urlSource ?? "unknown");
      sourceTally[src] = (sourceTally[src] ?? 0) + 1;
    }
    console.debug("[attendance/screenshots]", {
      employee_id: (log as any).employee_id,
      attendance_log_id: logId,
      screenshot_rows_found: (rows ?? []).length,
      screenshot_count: screenshots.length,
      url_source_tally: sourceTally,
    });
  }

  return NextResponse.json({ screenshots });
}
