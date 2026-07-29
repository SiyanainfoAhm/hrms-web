-- Desktop agent screenshot interval settings (per company).
-- Super Admin manages via HRMS web; desktop agents read by company_id.

create table if not exists public."HRMS_agent_settings" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."HRMS_companies"(id) on delete cascade,
  screenshot_interval_seconds integer not null default 300
    check (screenshot_interval_seconds in (300, 180, 60, 30)),
  min_allowed_interval_seconds integer not null default 60
    check (min_allowed_interval_seconds in (60, 30)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hrms_agent_settings_interval_gte_min
    check (screenshot_interval_seconds >= min_allowed_interval_seconds)
);

create unique index if not exists ux_hrms_agent_settings_company
  on public."HRMS_agent_settings"(company_id);
