import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { backfillApprovedOfficeLeaveAttendance } from "@/lib/officeLeaveAttendance";

function isApprover(role: string): boolean {
  return role === "super_admin" || role === "admin" || role === "hr";
}

/** Admin-only repair: create missing synthetic attendance for approved Office Leave requests. */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isApprover(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: me, error: meErr } = await supabaseAdmin
    .from("HRMS_users")
    .select("company_id")
    .eq("id", session.id)
    .maybeSingle();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  if (!me?.company_id) return NextResponse.json({ error: "User not linked to company" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const leaveRequestId = typeof body?.leaveRequestId === "string" ? body.leaveRequestId.trim() : undefined;
  const employeeUserId = typeof body?.employeeUserId === "string" ? body.employeeUserId.trim() : undefined;

  const summary = await backfillApprovedOfficeLeaveAttendance({
    supabase: supabaseAdmin,
    companyId: me.company_id,
    leaveRequestId,
    employeeUserId,
  });

  return NextResponse.json({ success: true, summary });
}
