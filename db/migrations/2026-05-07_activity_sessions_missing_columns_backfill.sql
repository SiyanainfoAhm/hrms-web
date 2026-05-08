-- Backfill missing columns used by the desktop attendance agent + web APIs.
-- Some environments were created before these columns existed.

alter table if exists public."HRMS_activity_sessions"
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists disconnected_seconds int default 0;

