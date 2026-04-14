import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, createSessionCookie, getCookieOptions, type SessionUser } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabase } from "@/lib/supabaseClient";

function isManagerial(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

function mapUser(row: any) {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name ?? null) as string | null,
    role: row.role as "super_admin" | "admin" | "hr" | "manager" | "employee",
    authProvider: (row.auth_provider ?? "password") as "password" | "google",
    companyId: (row.company_id ?? null) as string | null,
    employeeCode: (row.employee_code ?? "") as string,
    phone: (row.phone ?? "") as string,
    dateOfBirth: row.date_of_birth ? String(row.date_of_birth) : "",
    dateOfJoining: row.date_of_joining ? String(row.date_of_joining) : "",
    currentAddressLine1: (row.current_address_line1 ?? "") as string,
    currentAddressLine2: (row.current_address_line2 ?? "") as string,
    currentCity: (row.current_city ?? "") as string,
    currentState: (row.current_state ?? "") as string,
    currentCountry: (row.current_country ?? "") as string,
    currentPostalCode: (row.current_postal_code ?? "") as string,
    permanentAddressLine1: (row.permanent_address_line1 ?? "") as string,
    permanentAddressLine2: (row.permanent_address_line2 ?? "") as string,
    permanentCity: (row.permanent_city ?? "") as string,
    permanentState: (row.permanent_state ?? "") as string,
    permanentCountry: (row.permanent_country ?? "") as string,
    permanentPostalCode: (row.permanent_postal_code ?? "") as string,
    emergencyContactName: (row.emergency_contact_name ?? "") as string,
    emergencyContactPhone: (row.emergency_contact_phone ?? "") as string,
    bankName: (row.bank_name ?? "") as string,
    bankAccountNumber: (row.bank_account_number ?? "") as string,
    bankIfsc: (row.bank_ifsc ?? "") as string,
    employmentStatus: (row.employment_status ?? "preboarding") as "preboarding" | "current" | "past",
    ctc: row.ctc != null ? Number(row.ctc) : null as number | null,
    gender: (row.gender ?? null) as string | null,
    designation: (row.designation ?? "") as string,
    designationId: (row.designation_id ?? null) as string | null,
    departmentId: (row.department_id ?? null) as string | null,
    divisionId: (row.division_id ?? null) as string | null,
    shiftId: (row.shift_id ?? null) as string | null,
    aadhaar: (row.aadhaar ?? "") as string,
    pan: (row.pan ?? "") as string,
    uanNumber: (row.uan_number ?? "") as string,
    pfNumber: (row.pf_number ?? "") as string,
    esicNumber: (row.esic_number ?? "") as string,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("HRMS_users").select("*").eq("id", session.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: mapUser(data) });
}

export async function PUT(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const canEditOrgFields = isManagerial(session.role);

  const allowedEmployment = ["preboarding", "current", "past"] as const;
  const employmentStatus = allowedEmployment.includes(body?.employmentStatus) ? body.employmentStatus : undefined;

  // Fetch existing bank details to decide whether to write a history entry
  const { data: existingUser, error: existingErr } = await supabase
    .from("HRMS_users")
    .select("company_id, bank_name, bank_account_number, bank_ifsc")
    .eq("id", session.id)
    .single();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 });

  const nextBankName = typeof body?.bankName === "string" ? body.bankName.trim() : "";
  const nextBankAccount = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";
  const nextBankIfsc = typeof body?.bankIfsc === "string" ? body.bankIfsc.trim() : "";

  const prevBankName = typeof existingUser?.bank_name === "string" ? existingUser.bank_name : "";
  const prevBankAccount =
    typeof existingUser?.bank_account_number === "string" ? existingUser.bank_account_number : "";
  const prevBankIfsc = typeof existingUser?.bank_ifsc === "string" ? existingUser.bank_ifsc : "";

  const bankChanged =
    nextBankName !== prevBankName || nextBankAccount !== prevBankAccount || nextBankIfsc !== prevBankIfsc;

  const payload: Record<string, any> = {
    name: typeof body?.name === "string" ? body.name.trim() || null : undefined,
    employee_code:
      isManagerial(session.role) && typeof body?.employeeCode === "string" ? body.employeeCode.trim() || null : undefined,
    phone: typeof body?.phone === "string" ? body.phone.trim() || null : undefined,
    date_of_birth: typeof body?.dateOfBirth === "string" ? body.dateOfBirth.trim() || null : undefined,
    date_of_joining:
      canEditOrgFields && typeof body?.dateOfJoining === "string" ? body.dateOfJoining.trim() || null : undefined,
    current_address_line1:
      typeof body?.currentAddressLine1 === "string" ? body.currentAddressLine1.trim() || null : undefined,
    current_address_line2:
      typeof body?.currentAddressLine2 === "string" ? body.currentAddressLine2.trim() || null : undefined,
    current_city: typeof body?.currentCity === "string" ? body.currentCity.trim() || null : undefined,
    current_state: typeof body?.currentState === "string" ? body.currentState.trim() || null : undefined,
    current_country: typeof body?.currentCountry === "string" ? body.currentCountry.trim() || null : undefined,
    current_postal_code:
      typeof body?.currentPostalCode === "string" ? body.currentPostalCode.trim() || null : undefined,
    permanent_address_line1:
      typeof body?.permanentAddressLine1 === "string" ? body.permanentAddressLine1.trim() || null : undefined,
    permanent_address_line2:
      typeof body?.permanentAddressLine2 === "string" ? body.permanentAddressLine2.trim() || null : undefined,
    permanent_city: typeof body?.permanentCity === "string" ? body.permanentCity.trim() || null : undefined,
    permanent_state: typeof body?.permanentState === "string" ? body.permanentState.trim() || null : undefined,
    permanent_country: typeof body?.permanentCountry === "string" ? body.permanentCountry.trim() || null : undefined,
    permanent_postal_code:
      typeof body?.permanentPostalCode === "string" ? body.permanentPostalCode.trim() || null : undefined,
    emergency_contact_name:
      typeof body?.emergencyContactName === "string" ? body.emergencyContactName.trim() || null : undefined,
    emergency_contact_phone:
      typeof body?.emergencyContactPhone === "string" ? body.emergencyContactPhone.trim() || null : undefined,
    bank_name: typeof body?.bankName === "string" ? body.bankName.trim() || null : undefined,
    bank_account_number:
      typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() || null : undefined,
    bank_ifsc: typeof body?.bankIfsc === "string" ? body.bankIfsc.trim() || null : undefined,
    employment_status: employmentStatus ?? undefined,
    gender: (() => {
      const allowed = ["male", "female", "other"];
      return allowed.includes(body?.gender) ? body.gender : undefined;
    })(),
    designation:
      canEditOrgFields && typeof body?.designation === "string" ? body.designation.trim() || null : undefined,
    designation_id:
      canEditOrgFields && typeof body?.designationId === "string" ? body.designationId.trim() || null : undefined,
    department_id:
      canEditOrgFields && typeof body?.departmentId === "string" ? body.departmentId.trim() || null : undefined,
    division_id:
      canEditOrgFields && typeof body?.divisionId === "string" ? body.divisionId.trim() || null : undefined,
    shift_id: canEditOrgFields && typeof body?.shiftId === "string" ? body.shiftId.trim() || null : undefined,
    aadhaar: typeof body?.aadhaar === "string" ? body.aadhaar.trim() || null : undefined,
    pan: typeof body?.pan === "string" ? body.pan.trim() || null : undefined,
    uan_number: isManagerial(session.role) && typeof body?.uanNumber === "string" ? body.uanNumber.trim() || null : undefined,
    pf_number: canEditOrgFields && typeof body?.pfNumber === "string" ? body.pfNumber.trim() || null : undefined,
    esic_number: canEditOrgFields && typeof body?.esicNumber === "string" ? body.esicNumber.trim() || null : undefined,
    updated_at: new Date().toISOString(),
  };

  // Remove undefined keys so we don't overwrite unintentionally
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const { data, error } = await supabase.from("HRMS_users").update(payload).eq("id", session.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Write bank account history entry when bank details change.
  // This preserves an audit trail and supports payroll snapshotting.
  if (bankChanged && existingUser?.company_id) {
    const now = new Date().toISOString();
    // Close current active record (if any)
    await supabase
      .from("HRMS_employee_bank_accounts")
      .update({ is_active: false, effective_to: now })
      .eq("user_id", session.id)
      .eq("is_active", true);

    // Insert new active record when any bank field is present
    if (nextBankName || nextBankAccount || nextBankIfsc) {
      await supabase.from("HRMS_employee_bank_accounts").insert([
        {
          company_id: existingUser.company_id,
          user_id: session.id,
          bank_name: nextBankName || null,
          bank_account_number: nextBankAccount || null,
          bank_ifsc: nextBankIfsc || null,
          is_active: true,
          effective_from: now,
          created_by: session.id,
        },
      ]);
    }
  }

  const res = NextResponse.json({ user: mapUser(data) });
  // Keep signed session cookie in sync so Sidebar/Dashboard reflect latest name immediately.
  const nextSession: SessionUser = {
    ...session,
    name: (data.name ?? null) as string | null,
    email: (data.email ?? session.email) as string,
  };
  res.cookies.set(COOKIE_NAME, createSessionCookie(nextSession), getCookieOptions());
  return res;
}

