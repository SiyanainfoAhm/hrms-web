-- Multi-monitor desktop agent screenshots: group captures from the same interval.

alter table if exists public."HRMS_activity_screenshots"
  add column if not exists capture_group_id uuid,
  add column if not exists screen_index int,
  add column if not exists screen_name text,
  add column if not exists screen_width int,
  add column if not exists screen_height int,
  add column if not exists is_primary_screen boolean not null default false;

create index if not exists hrms_activity_screenshots_capture_group_idx
  on public."HRMS_activity_screenshots"(capture_group_id)
  where capture_group_id is not null;

comment on column public."HRMS_activity_screenshots".capture_group_id is
  'Shared id for all monitor screenshots captured in the same agent interval.';
comment on column public."HRMS_activity_screenshots".screen_index is
  '1-based monitor index within a capture_group_id.';
