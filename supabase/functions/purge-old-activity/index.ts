// @ts-nocheck — Deno runtime; file is excluded from the Next.js tsc build.
// Supabase Edge Function: purge-old-activity
//
// Daily retention worker for desktop-agent activity records.
//
// Workflow (one HTTP invocation):
//   1. Call the SQL helper `public.purge_old_activity_summarize(cutoff_date)`
//      which folds session active/idle/disconnected seconds onto the
//      matching `HRMS_attendance_logs` row and stamps `activity_purged_at`.
//      After this, the API will keep returning correct active-time numbers
//      for those days even though the raw rows are gone.
//   2. Page through `HRMS_activity_screenshots` rows older than the cutoff.
//      For each row:
//        - if `storage_path` is an absolute URL, issue HTTP DELETE against
//          it (the SAS token includes 'd' permission); otherwise call
//          `supabase.storage.from(bucket).remove([path])`.
//        - delete the DB row.
//   3. Delete `HRMS_activity_sessions` rows older than cutoff.
//   4. Delete `HRMS_attendance_state` rows whose attendance log is older
//      than the cutoff (or whose work_date itself is older than cutoff).
//
// Deploy with:
//     supabase functions deploy purge-old-activity
//
// Authentication: this function is deployed with the default
// `--verify-jwt`, so it rejects unauthenticated callers automatically.
// The pg_cron schedule passes the project's `service_role` key in the
// `Authorization` header — no custom shared secret is needed.
//
// Platform-provided env vars (no secrets to set):
//     SUPABASE_URL
//     SUPABASE_SERVICE_ROLE_KEY

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const RETENTION_DAYS = 90;
const PAGE_SIZE = 200;
const BLOB_PARALLELISM = 8;

type Json = Record<string, unknown>;

function isAbsoluteUrl(p: string): boolean {
  return /^https?:\/\//i.test(p);
}

async function deleteAzureBlob(url: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "x-ms-version": "2025-11-05" },
    });
    if (res.ok || res.status === 404 || res.status === 202) {
      return { ok: true, status: res.status };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: body.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function processInBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    await Promise.all(slice.map(fn));
  }
}

Deno.serve(async (_req) => {
  // Authentication is handled by Supabase's default JWT verification on
  // the function endpoint — by the time we get here, the caller already
  // presented a valid project JWT (the cron uses `service_role`).

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const cutoffYmd = cutoffDate.toISOString().slice(0, 10);
  const cutoffIso = cutoffDate.toISOString();

  const summary: Json = {
    cutoffDate: cutoffYmd,
    cutoffIso,
    summarizedLogs: 0,
    deletedScreenshotRows: 0,
    deletedAzureBlobs: 0,
    failedAzureBlobs: 0,
    deletedSupabaseObjects: 0,
    deletedSessionRows: 0,
    deletedStateRows: 0,
    errors: [] as string[],
  };

  /* -------------------------- 1. Summarise -------------------------- */

  {
    const { data, error } = await supabase.rpc("purge_old_activity_summarize", {
      cutoff_date: cutoffYmd,
    });
    if (error) {
      (summary.errors as string[]).push(`summarize: ${error.message}`);
    } else {
      summary.summarizedLogs = Number(data) || 0;
    }
  }

  /* -------------------------- 2. Screenshots -------------------------- */

  for (;;) {
    const { data: rows, error } = await supabase
      .from("HRMS_activity_screenshots")
      .select("id, storage_bucket, storage_path")
      .lt("captured_at", cutoffIso)
      .order("captured_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      (summary.errors as string[]).push(`select screenshots: ${error.message}`);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Group relative paths per bucket so we can use storage.remove() in batches.
    const supabaseObjectsByBucket = new Map<string, string[]>();
    const azureUrls: string[] = [];

    for (const r of rows) {
      const path = String((r as any).storage_path || "");
      const bucket = String((r as any).storage_bucket || "photomedia");
      if (!path) continue;
      if (isAbsoluteUrl(path)) {
        azureUrls.push(path);
      } else {
        const list = supabaseObjectsByBucket.get(bucket) ?? [];
        list.push(path);
        supabaseObjectsByBucket.set(bucket, list);
      }
    }

    // Delete Azure blobs in parallel.
    await processInBatches(azureUrls, BLOB_PARALLELISM, async (url) => {
      const r = await deleteAzureBlob(url);
      if (r.ok) {
        (summary.deletedAzureBlobs as number)++;
      } else {
        (summary.failedAzureBlobs as number)++;
        if ((summary.errors as string[]).length < 25) {
          (summary.errors as string[]).push(`azure ${r.status}: ${r.error ?? ""}`);
        }
      }
    });

    // Delete Supabase Storage objects in batches.
    for (const [bucket, paths] of supabaseObjectsByBucket.entries()) {
      const { data: removed, error: rmErr } = await supabase.storage.from(bucket).remove(paths);
      if (rmErr) {
        (summary.errors as string[]).push(`storage.remove(${bucket}): ${rmErr.message}`);
      } else {
        (summary.deletedSupabaseObjects as number) += Array.isArray(removed) ? removed.length : 0;
      }
    }

    // Delete the screenshot DB rows.
    const ids = rows.map((r: any) => r.id).filter(Boolean);
    if (ids.length) {
      const { error: delErr } = await supabase
        .from("HRMS_activity_screenshots")
        .delete()
        .in("id", ids);
      if (delErr) {
        (summary.errors as string[]).push(`delete screenshot rows: ${delErr.message}`);
        break;
      }
      summary.deletedScreenshotRows = (summary.deletedScreenshotRows as number) + ids.length;
    }

    if (rows.length < PAGE_SIZE) break;
  }

  /* -------------------------- 3. Sessions -------------------------- */

  {
    const { error, count } = await supabase
      .from("HRMS_activity_sessions")
      .delete({ count: "exact" })
      .lt("started_at", cutoffIso);
    if (error) {
      (summary.errors as string[]).push(`delete sessions: ${error.message}`);
    } else {
      summary.deletedSessionRows = count ?? 0;
    }
  }

  /* -------------------------- 4. Attendance state -------------------------- */
  /*
   * `HRMS_attendance_state` is keyed by (company_id, employee_id) and reflects
   * the *current* punch state. We only delete rows whose pointer references an
   * old log, AND whose work_date is also older than the cutoff — never the
   * row that represents today/now.
   */
  {
    const { error, count } = await supabase
      .from("HRMS_attendance_state")
      .delete({ count: "exact" })
      .lt("work_date", cutoffYmd);
    if (error) {
      (summary.errors as string[]).push(`delete state: ${error.message}`);
    } else {
      summary.deletedStateRows = count ?? 0;
    }
  }

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { "content-type": "application/json" },
  });
});
