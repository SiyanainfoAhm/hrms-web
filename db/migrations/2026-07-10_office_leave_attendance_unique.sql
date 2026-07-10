-- Prevent duplicate synthetic Office Leave attendance rows per employee/day.

create unique index if not exists hrms_attendance_logs_office_leave_day_uidx
  on public."HRMS_attendance_logs"(company_id, employee_id, work_date)
  where is_office_leave = true;
