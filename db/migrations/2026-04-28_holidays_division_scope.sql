-- Division-scoped holidays.
-- Adds `division_id` to HRMS_holidays to allow employees to see only their division holidays,
-- while admins can switch division tabs (All + divisions).
--
-- Safe defaults:
-- - division_id NULL means "All divisions / company-wide".
-- - Backfill existing holidays to "Ahmedabad" division when possible.

alter table "HRMS_holidays"
  add column if not exists "division_id" uuid null;

-- FK (softly enforced; set null if division deleted).
alter table "HRMS_holidays"
  drop constraint if exists "HRMS_holidays_division_id_fkey";
alter table "HRMS_holidays"
  add constraint "HRMS_holidays_division_id_fkey"
  foreign key ("division_id") references "HRMS_divisions" ("id")
  on delete set null;

create index if not exists "hrms_holidays_company_division_date_idx"
  on "HRMS_holidays" ("company_id", "division_id", "holiday_date");

-- Backfill: assign existing holidays to Ahmedabad division (if present) when division_id is NULL.
update "HRMS_holidays" h
set division_id = d.id
from "HRMS_divisions" d
where h.company_id = d.company_id
  and h.division_id is null
  and lower(coalesce(d.name, '')) like '%ahmedabad%';

