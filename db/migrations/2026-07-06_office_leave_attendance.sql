-- Office Leave: attachment on leave request; synthetic attendance row (9h gross / 1h break / 8h active).

alter table if exists public."HRMS_leave_requests"
  add column if not exists attachment_url text;

alter table if exists public."HRMS_attendance_logs"
  add column if not exists is_office_leave boolean not null default false,
  add column if not exists office_leave_request_id uuid references public."HRMS_leave_requests"(id) on delete set null,
  add column if not exists office_leave_attachment_url text;

create index if not exists hrms_attendance_logs_office_leave_request_idx
  on public."HRMS_attendance_logs"(office_leave_request_id)
  where office_leave_request_id is not null;

comment on column public."HRMS_attendance_logs".is_office_leave is
  'Synthetic attendance from approved Office Leave (OL): 9h gross, 1h break, 8h active.';
comment on column public."HRMS_attendance_logs".office_leave_attachment_url is
  'Proof attachment URL copied from the approved Office Leave request.';
