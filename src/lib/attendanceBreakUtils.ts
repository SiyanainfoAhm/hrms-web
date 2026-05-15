/**
 * Lunch/tea break duration and break windows for idle/disconnected math.
 * Multiple breaks are stored in `*_break_segments` (out→in pairs).
 * Legacy `lunch_check_out_at` / `lunch_check_in_at` hold first out and last in only —
 * never use that span when segments exist (it includes working time between breaks).
 */

export type BreakSegment = { out: string; in: string };

export type BreakWindow = {
  startMs: number;
  endMs: number;
};

function clampMinutes(n: number): number {
  return Math.min(24 * 60, Math.max(0, Math.round(Number(n) || 0)));
}

export function minutesBetween(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function asBreakSegments(raw: unknown): BreakSegment[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (x && typeof x === "object" ? x : null))
      .filter(Boolean)
      .map((x: any) => ({
        out: String(x.out ?? ""),
        in: String(x.in ?? ""),
      }))
      .filter((s) => s.out && s.in);
  }
  if (typeof raw === "string") {
    try {
      return asBreakSegments(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function addBreakWindow(
  windows: BreakWindow[],
  startIso: string | null | undefined,
  endIso: string | null | undefined,
) {
  if (!startIso || !endIso) return;
  const startMs = new Date(String(startIso)).getTime();
  const endMs = new Date(String(endIso)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
  windows.push({ startMs, endMs });
}

function mergeBreakWindows(windows: BreakWindow[]): BreakWindow[] {
  const sorted = windows
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs > w.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: BreakWindow[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (!last || w.startMs > last.endMs) {
      merged.push({ ...w });
    } else {
      last.endMs = Math.max(last.endMs, w.endMs);
    }
  }
  return merged;
}

/** Minutes from completed segment pairs plus an open running break. */
export function breakMinutesForKind(args: {
  recordedMinutes: number;
  segments: BreakSegment[];
  legacyOut?: string | null;
  legacyIn?: string | null;
  runningStart?: string | null;
  nowIso: string;
}): number {
  let fromSegments = 0;
  for (const s of args.segments) {
    fromSegments += minutesBetween(s.out, s.in);
  }
  if (args.runningStart) {
    fromSegments += minutesBetween(String(args.runningStart), args.nowIso);
  }

  if (args.segments.length > 0 || args.runningStart) {
    return fromSegments;
  }

  const legacySpan = minutesBetween(args.legacyOut ?? null, args.legacyIn ?? null);
  return Math.max(clampMinutes(args.recordedMinutes), legacySpan);
}

export function lunchTeaBreakMinutesBase(
  log: {
    lunch_break_minutes?: number | null;
    tea_break_minutes?: number | null;
    lunch_break_segments?: unknown;
    tea_break_segments?: unknown;
    lunch_check_out_at?: string | null;
    lunch_check_in_at?: string | null;
    tea_check_out_at?: string | null;
    tea_check_in_at?: string | null;
    lunch_break_started_at?: string | null;
    tea_break_started_at?: string | null;
  },
  nowIso: string,
): { lunchMinutes: number; teaMinutes: number } {
  const lunchSegs = asBreakSegments(log.lunch_break_segments);
  const teaSegs = asBreakSegments(log.tea_break_segments);

  return {
    lunchMinutes: breakMinutesForKind({
      recordedMinutes: Number(log.lunch_break_minutes) || 0,
      segments: lunchSegs,
      legacyOut: log.lunch_check_out_at,
      legacyIn: log.lunch_check_in_at,
      runningStart: log.lunch_break_started_at,
      nowIso,
    }),
    teaMinutes: breakMinutesForKind({
      recordedMinutes: Number(log.tea_break_minutes) || 0,
      segments: teaSegs,
      legacyOut: log.tea_check_out_at,
      legacyIn: log.tea_check_in_at,
      runningStart: log.tea_break_started_at,
      nowIso,
    }),
  };
}

/** Merged break windows for excluding lunch/tea from disconnected idle gaps. */
export function breakWindowsFromLog(
  log: {
    lunch_break_segments?: unknown;
    tea_break_segments?: unknown;
    lunch_check_out_at?: string | null;
    lunch_check_in_at?: string | null;
    tea_check_out_at?: string | null;
    tea_check_in_at?: string | null;
    lunch_break_started_at?: string | null;
    tea_break_started_at?: string | null;
  },
  nowMs: number,
): BreakWindow[] {
  const windows: BreakWindow[] = [];
  const nowIso = new Date(nowMs).toISOString();

  const lunchSegs = asBreakSegments(log.lunch_break_segments);
  const teaSegs = asBreakSegments(log.tea_break_segments);

  for (const s of lunchSegs) addBreakWindow(windows, s.out, s.in);
  for (const s of teaSegs) addBreakWindow(windows, s.out, s.in);

  if (lunchSegs.length === 0) {
    addBreakWindow(windows, log.lunch_check_out_at ?? null, log.lunch_check_in_at ?? null);
  }
  if (teaSegs.length === 0) {
    addBreakWindow(windows, log.tea_check_out_at ?? null, log.tea_check_in_at ?? null);
  }

  if (log.lunch_break_started_at) {
    addBreakWindow(windows, String(log.lunch_break_started_at), nowIso);
  }
  if (log.tea_break_started_at) {
    addBreakWindow(windows, String(log.tea_break_started_at), nowIso);
  }

  return mergeBreakWindows(windows);
}
