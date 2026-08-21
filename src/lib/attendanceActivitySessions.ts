import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivitySessionRow } from "@/lib/attendanceActivityAggregate";

const PAGE = 1000;
const LOG_CHUNK = 80;

/**
 * Load every activity session for the given attendance log ids
 * (paginated — never latest-only / never LIMIT 1).
 */
export async function loadActivitySessionsForLogIds(
  client: SupabaseClient,
  logIds: string[],
): Promise<ActivitySessionRow[]> {
  const ids = [...new Set(logIds.map(String).filter(Boolean))];
  if (!ids.length) return [];

  const all: ActivitySessionRow[] = [];

  for (let i = 0; i < ids.length; i += LOG_CHUNK) {
    const chunk = ids.slice(i, i + LOG_CHUNK);
    let from = 0;

    for (;;) {
      const { data, error } = await client
        .from("HRMS_activity_sessions")
        .select(
          "attendance_log_id, started_at, ended_at, last_heartbeat_at, active_seconds, idle_seconds, disconnected_seconds",
        )
        .in("attendance_log_id", chunk)
        .range(from, from + PAGE - 1);

      if (error) throw error;

      const rows = (data ?? []) as ActivitySessionRow[];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  return all;
}
