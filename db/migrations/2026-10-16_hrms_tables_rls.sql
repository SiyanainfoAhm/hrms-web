-- Lock down every current HRMS application table exposed through Supabase's
-- Data API. HRMS Web authorizes requests in its Next.js routes and those routes
-- use SUPABASE_SERVICE_ROLE_KEY; browsers must not query HRMS_* tables directly.
--
-- Apply in the Supabase SQL Editor or the project's migration runner. This is
-- deliberately idempotent so it can be run again after importing HRMS tables.

do $$
declare
  hrms_table record;
begin
  for hrms_table in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename like 'HRMS!_%' escape '!'
  loop
    execute format('alter table public.%I enable row level security', hrms_table.tablename);
    execute format('revoke all privileges on table public.%I from anon, authenticated', hrms_table.tablename);
  end loop;
end;
$$;

-- Verification query (run after the migration):
-- select c.relname as table_name,
--        c.relrowsecurity as rls_enabled,
--        has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_has_access,
--        has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_has_access
-- from pg_catalog.pg_class c
-- join pg_catalog.pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relname like 'HRMS!_%' escape '!'
-- order by c.relname;
