-- Adds company geofence coordinates + attendance captured location.
-- Apply in Supabase SQL editor (or your migration tool).

-- 1) Company geofence
alter table "HRMS_companies"
  add column if not exists "latitude" double precision,
  add column if not exists "longitude" double precision,
  add column if not exists "office_radius_m" integer not null default 150;

-- Optional: enforce both-or-none (commented; enable if desired)
-- alter table "HRMS_companies"
--   add constraint "hrms_companies_lat_lng_both_or_none"
--   check (("latitude" is null and "longitude" is null) or ("latitude" is not null and "longitude" is not null));

-- 2) Attendance captured location + derived in_office flag
alter table "HRMS_attendance_logs"
  add column if not exists "check_in_lat" double precision,
  add column if not exists "check_in_lng" double precision,
  add column if not exists "check_in_accuracy_m" integer,
  add column if not exists "check_out_lat" double precision,
  add column if not exists "check_out_lng" double precision,
  add column if not exists "check_out_accuracy_m" integer,
  add column if not exists "in_office" boolean not null default false,
  add column if not exists "check_in_in_office" boolean,
  add column if not exists "check_out_in_office" boolean,
  add column if not exists "office_note" text,
  add column if not exists "notes" text;

