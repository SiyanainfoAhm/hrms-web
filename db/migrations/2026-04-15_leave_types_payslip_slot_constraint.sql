-- Fix payslip_slot constraint to allow CL/PL/SL (and legacy values).
-- Run in Supabase SQL editor.

-- Drop old check constraint if present.
alter table "HRMS_leave_types"
  drop constraint if exists "hrms_leave_types_payslip_slot_chk";

-- Recreate with new allowed values (keeps legacy values for existing data).
alter table "HRMS_leave_types"
  add constraint "hrms_leave_types_payslip_slot_chk"
  check (
    "payslip_slot" is null
    or upper("payslip_slot") in ('CL','PL','SL','EL','HPL','HL')
  );

