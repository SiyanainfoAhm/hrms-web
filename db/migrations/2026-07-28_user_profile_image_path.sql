-- Employee profile picture storage path (object path in photomedia bucket).
-- Example: profile-pictures/{user_id}/avatar-1722154400000.webp
alter table public."HRMS_users"
  add column if not exists profile_image_path text;

comment on column public."HRMS_users".profile_image_path is
  'Supabase Storage object path for employee profile picture (bucket: photomedia).';
