import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const { data: master, error } = await supabase
    .from("HRMS_payroll_master")
    .select("id, tds, advance_bonus, gross_salary, ctc, pf_eligible, esic_eligible, pt, effective_start_date")
    .eq("company_id", me.company_id)
    .eq("employee_user_id", session.id)
    .is("effective_end_date", null)
    .order("effective_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ payrollMaster: master ?? null });
}

