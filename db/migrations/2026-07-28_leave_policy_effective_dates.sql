-- Effective-dated leave policy versions (company-scoped).
-- Preserves historical quotas when policies change; balances resolve by date.

-- 1) Identity + versioning columns
alter table public."HRMS_leave_policies"
  add column if not exists id uuid default gen_random_uuid();

update public."HRMS_leave_policies"
set id = gen_random_uuid()
where id is null;

alter table public."HRMS_leave_policies"
  alter column id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'HRMS_leave_policies_pkey'
  ) then
    -- Drop old composite PK if present (company_id, leave_type_id)
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'HRMS_leave_policies'
        and c.contype = 'p'
    ) then
      alter table public."HRMS_leave_policies" drop constraint if exists "HRMS_leave_policies_pkey";
    end if;
    alter table public."HRMS_leave_policies" add constraint "HRMS_leave_policies_pkey" primary key (id);
  end if;
end $$;

alter table public."HRMS_leave_policies"
  add column if not exists effective_from date not null default date '2000-01-01';

alter table public."HRMS_leave_policies"
  add column if not exists effective_to date;

alter table public."HRMS_leave_policies"
  add column if not exists request_enabled boolean not null default true;

-- Existing single-row policies become open-ended historical versions from epoch.
update public."HRMS_leave_policies"
set
  effective_from = coalesce(effective_from, date '2000-01-01'),
  request_enabled = coalesce(request_enabled, true)
where true;

-- 2) Replace unique (company_id, leave_type_id) with versioned uniqueness
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'HRMS_leave_policies'
      and con.contype = 'u'
  loop
    execute format('alter table public."HRMS_leave_policies" drop constraint if exists %I', c.conname);
  end loop;
end $$;

drop index if exists "HRMS_leave_policies_company_id_leave_type_id_key";
drop index if exists hrms_leave_policies_company_id_leave_type_id_key;

create unique index if not exists hrms_leave_policies_company_type_from_uidx
  on public."HRMS_leave_policies" (company_id, leave_type_id, effective_from);

-- Prevent open-ended duplicates (at most one null effective_to per company+type)
create unique index if not exists hrms_leave_policies_company_type_open_uidx
  on public."HRMS_leave_policies" (company_id, leave_type_id)
  where effective_to is null;

comment on column public."HRMS_leave_policies".effective_from is
  'Inclusive start date this policy version applies (company-scoped).';
comment on column public."HRMS_leave_policies".effective_to is
  'Inclusive end date; NULL means currently open-ended / future-open.';
comment on column public."HRMS_leave_policies".request_enabled is
  'When false, new leave requests of this type are blocked while this version is in force.';
