-- Bank account holder name (may differ from employee legal name). Run in Supabase SQL editor.

alter table "HRMS_users"
  add column if not exists bank_account_holder_name text;
