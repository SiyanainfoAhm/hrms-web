import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateActivitySeconds } from "./attendanceActivityAggregate";

describe("aggregateActivitySeconds", () => {
  it("dedupes overlapping parallel sessions before summing", () => {
    const result = aggregateActivitySeconds([
      {
        attendance_log_id: "a",
        started_at: "2026-08-20T03:19:54.187Z",
        ended_at: "2026-08-20T06:58:09.438Z",
        active_seconds: 13095,
        idle_seconds: 0,
      },
      {
        attendance_log_id: "a",
        started_at: "2026-08-20T03:19:55.189Z",
        ended_at: "2026-08-20T06:58:09.58Z",
        active_seconds: 13094,
        idle_seconds: 0,
      },
      {
        attendance_log_id: "a",
        started_at: "2026-08-20T07:00:00.000Z",
        ended_at: "2026-08-20T08:00:00.000Z",
        active_seconds: 3600,
        idle_seconds: 120,
      },
    ]);

    assert.equal(result.sessionCount, 3);
    assert.equal(result.dedupedSessionCount, 2);
    assert.equal(result.activeSeconds, 13095 + 3600);
    assert.equal(result.idleSeconds, 120);
  });
});
