import type { SupabaseClient } from "@supabase/supabase-js";
import { screenshotRowHasMedia } from "@/lib/attendanceScreenshotUrl";

/**
 * Count screenshots per attendance_log_id.
 *
 * Prefer an exact head-count (no row payload). Fall back to paged rows when
 * the DB rejects the OR media filter (older schemas).
 *
 * Scope by attendance_log_id (session), not employee_id alone — one employee
 * can have many logs. company_id is optional hardening when provided.
 */
export async function loadScreenshotCountByLogId(
  client: SupabaseClient,
  args: {
    logIds: string[];
    companyId?: string | null;
  },
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const logIds = [...new Set(args.logIds.map(String).filter(Boolean))];
  if (!logIds.length) return counts;

  const LOG_CHUNK = 40;

  for (let i = 0; i < logIds.length; i += LOG_CHUNK) {
    const chunk = logIds.slice(i, i + LOG_CHUNK);
    await Promise.all(
      chunk.map(async (logId) => {
        const n = await countScreenshotsForLog(client, {
          logId,
          companyId: args.companyId,
        });
        if (n > 0) counts.set(logId, n);
      }),
    );
  }

  return counts;
}

async function countScreenshotsForLog(
  client: SupabaseClient,
  args: { logId: string; companyId?: string | null },
): Promise<number> {
  // Agent always writes `storage_path` (Azure URL or object key). Count every
  // row for this attendance_log_id — do not require file_url.
  const runHead = async () => {
    let q = client
      .from("HRMS_activity_screenshots")
      .select("id", { count: "exact", head: true })
      .eq("attendance_log_id", args.logId);
    if (args.companyId) q = q.eq("company_id", args.companyId);
    return q;
  };

  const { count, error } = await runHead();
  if (!error && typeof count === "number") return count;
  if (error) {
    // Fall back to paging + media check (handles unusual schema drift).
    return countScreenshotsByPaging(client, args);
  }
  return 0;
}

async function countScreenshotsByPaging(
  client: SupabaseClient,
  args: { logId: string; companyId?: string | null },
): Promise<number> {
  const PAGE = 1000;
  let from = 0;
  let total = 0;

  for (;;) {
    let q = client
      .from("HRMS_activity_screenshots")
      .select("id, storage_path, file_url, file_path")
      .eq("attendance_log_id", args.logId)
      .range(from, from + PAGE - 1);

    if (args.companyId) q = q.eq("company_id", args.companyId);

    let { data, error } = await q;

    if (error && /file_url|file_path|column/i.test(String(error.message || ""))) {
      let q2 = client
        .from("HRMS_activity_screenshots")
        .select("id, storage_path")
        .eq("attendance_log_id", args.logId)
        .range(from, from + PAGE - 1);
      if (args.companyId) q2 = q2.eq("company_id", args.companyId);
      const fallback = await q2;
      if (fallback.error) throw fallback.error;
      data = fallback.data as any;
      error = null;
    }

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      if (screenshotRowHasMedia(row as any)) total += 1;
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  return total;
}
