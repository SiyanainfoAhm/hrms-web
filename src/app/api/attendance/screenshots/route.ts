import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
 * Each item is returned with a short-lived signed URL so we don't have
 * to expose the storage bucket as public.
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
    .select("id, company_id")
    .eq("id", logId)
    .maybeSingle();
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });
  if (!log || String(log.company_id) !== String(me.company_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("HRMS_activity_screenshots")
    .select(
      "id, captured_at, trigger_type, storage_bucket, storage_path, app_name, window_title, mouse_active, keyboard_active, idle_seconds",
    )
    .eq("company_id", me.company_id)
    .eq("attendance_log_id", logId)
    .order("captured_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  /**
   * The desktop agent stores `storage_path` in one of two shapes:
   *
   *   1. A relative object key inside a Supabase Storage bucket
   *      (e.g. `HRMS/attendance screenshots/<company>/...`). For these
   *      we ask Supabase for a short-lived signed URL.
   *
   *   2. The **fully-qualified Azure Blob URL** of an externally-hosted
   *      screenshot, including its own SAS token (e.g.
   *      `https://hrms2026.blob.core.windows.net/attendance/<company>/...?sp=racwd&sig=...`).
   *      For these we MUST use the URL as-is — feeding it back through
   *      `createSignedUrls` produces broken paths like
   *      `…/storage/v1/object/public/attendance/https://hrms2026.blob…`.
   */
  function isAbsoluteUrl(p: string): boolean {
    return /^https?:\/\//i.test(p);
  }

  type ItemRef = { id: string; path: string };
  const byBucket = new Map<string, ItemRef[]>();
  const urlByRowId = new Map<string, string>();

  for (const r of rows ?? []) {
    const id = String((r as any).id);
    const bucket = String((r as any).storage_bucket || "photomedia");
    const path = String((r as any).storage_path || "");
    if (!path) continue;

    if (isAbsoluteUrl(path)) {
      // Absolute URL — already self-authenticating via its embedded
      // SAS token. Use it directly.
      urlByRowId.set(id, path);
      continue;
    }

    const list = byBucket.get(bucket) ?? [];
    list.push({ id, path });
    byBucket.set(bucket, list);
  }

  for (const [bucket, items] of byBucket.entries()) {
    if (!items.length) continue;
    const paths = items.map((i) => i.path);
    const { data: signed } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (Array.isArray(signed)) {
      signed.forEach((s, idx) => {
        // Different supabase-js versions: `signedUrl` (current) vs `signedURL` (older).
        const raw = s as { signedUrl?: string | null; signedURL?: string | null };
        const u = raw?.signedUrl ?? raw?.signedURL;
        if (u) urlByRowId.set(items[idx].id, u);
      });
    }
    for (const item of items) {
      if (urlByRowId.has(item.id)) continue;
      // Fallback: public URL for buckets that allow it.
      const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(item.path);
      if (pub?.publicUrl) urlByRowId.set(item.id, pub.publicUrl);
    }
  }

  // Strip any `download` directive from URLs so `<img>` can render them
  // inline (with it the storage proxy returns Content-Disposition:
  // attachment and browsers refuse to paint the bytes as an image).
  function inlineUrl(u: string): string {
    try {
      const url = new URL(u);
      url.searchParams.delete("download");
      return url.toString();
    } catch {
      return u;
    }
  }

  const screenshots = (rows ?? [])
    .map((r: any) => {
      const url = urlByRowId.get(String(r.id));
      if (!url) return null;
      return {
        id: String(r.id),
        capturedAt: r.captured_at ? new Date(r.captured_at).toISOString() : null,
        triggerType: r.trigger_type ?? null,
        appName: r.app_name ?? null,
        windowTitle: r.window_title ?? null,
        mouseActive: Boolean(r.mouse_active),
        keyboardActive: Boolean(r.keyboard_active),
        idleSeconds: Number(r.idle_seconds) || 0,
        url: inlineUrl(url),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ screenshots });
}
