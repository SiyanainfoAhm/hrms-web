-- Allow same department name across different divisions (branches).
-- Run in Supabase SQL editor.

-- Drop old unique constraint (company_id, name) if present.
alter table "HRMS_departments"
  drop constraint if exists "HRMS_departments_company_id_name_key";

-- Some environments lower-case constraint names.
alter table "HRMS_departments"
  drop constraint if exists "hrms_departments_company_id_name_key";

-- If an old unique index exists (rare, but can happen), drop it too.
drop index if exists "HRMS_departments_company_id_name_key";
drop index if exists "hrms_departments_company_id_name_key";

-- Enforce uniqueness within a division instead.
-- Note: Postgres unique indexes treat NULLs as distinct, so multiple rows with division_id NULL will be allowed.
create unique index if not exists "hrms_departments_company_division_name_uniq"
  on "HRMS_departments" ("company_id", "division_id", "name");

