-- Custom company roles: store permission set and allow multiple non-default roles per company.

alter table if exists "HRMS_roles"
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table if exists "HRMS_roles" drop constraint if exists "HRMS_roles_company_id_role_key_key";

create unique index if not exists hrms_roles_company_default_role_key_uniq
  on "HRMS_roles" (company_id, role_key)
  where is_default = true;

create unique index if not exists hrms_roles_company_name_uniq
  on "HRMS_roles" (company_id, name);
