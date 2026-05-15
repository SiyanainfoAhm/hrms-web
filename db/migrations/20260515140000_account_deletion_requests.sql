-- Account deletion requests (Google Play / privacy compliance + super-admin review).

create table if not exists "HRMS_account_deletion_requests" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references "HRMS_companies"(id) on delete cascade,
  user_id uuid not null references "HRMS_users"(id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  scheduled_deletion_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references "HRMS_users"(id) on delete set null,
  completed_by uuid references "HRMS_users"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hrms_account_deletion_requests_company_idx
  on "HRMS_account_deletion_requests"(company_id, requested_at desc);

create unique index if not exists hrms_account_deletion_requests_user_pending_uidx
  on "HRMS_account_deletion_requests"(user_id)
  where status = 'pending';

create or replace function hrms_account_deletion_requests_list(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor record;
begin
  select u.id, u.role, u.company_id into actor
  from "HRMS_users" u where u.id = p_actor_id;

  if actor.id is null then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;
  if actor.role <> 'super_admin' then
    raise exception 'Only super admins can view deletion requests' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.requested_at desc)
    from (
      select
        r.id,
        r.user_id,
        r.email,
        r.status,
        r.requested_at,
        r.scheduled_deletion_at,
        r.completed_at,
        r.cancelled_at,
        u.name as user_name,
        u.role as user_role,
        u.employee_code
      from "HRMS_account_deletion_requests" r
      join "HRMS_users" u on u.id = r.user_id
      where r.company_id = actor.company_id
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function hrms_account_deletion_request_set_status(
  p_actor_id uuid,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  req record;
  now_ts timestamptz := now();
begin
  if p_status not in ('cancelled', 'completed') then
    raise exception 'Invalid status' using errcode = 'P0001';
  end if;

  select u.id, u.role, u.company_id into actor
  from "HRMS_users" u where u.id = p_actor_id;

  if actor.id is null or actor.role <> 'super_admin' then
    raise exception 'Only super admins can update deletion requests' using errcode = 'P0001';
  end if;

  select * into req
  from "HRMS_account_deletion_requests" r
  where r.id = p_request_id and r.company_id = actor.company_id;

  if req.id is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  if req.status <> 'pending' then
    raise exception 'Only pending requests can be updated' using errcode = 'P0001';
  end if;

  if p_status = 'cancelled' then
    update "HRMS_account_deletion_requests"
    set status = 'cancelled', cancelled_at = now_ts, cancelled_by = actor.id, updated_at = now_ts
    where id = p_request_id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;

  -- completed: remove user (cascades related rows where configured)
  if req.user_id = actor.id then
    raise exception 'Cannot complete deletion for your own account' using errcode = 'P0001';
  end if;

  if exists (select 1 from "HRMS_users" u where u.id = req.user_id and u.role = 'super_admin') then
    raise exception 'Cannot delete a super admin account' using errcode = 'P0001';
  end if;

  delete from "HRMS_users" where id = req.user_id and company_id = actor.company_id;

  update "HRMS_account_deletion_requests"
  set status = 'completed', completed_at = now_ts, completed_by = actor.id, updated_at = now_ts
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'status', 'completed');
end;
$$;
