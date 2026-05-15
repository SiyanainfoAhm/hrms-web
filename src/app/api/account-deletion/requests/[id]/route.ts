import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admins can update deletion requests" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = typeof body?.status === "string" ? body.status.trim() : "";

  if (status !== "cancelled" && status !== "completed") {
    return NextResponse.json({ error: "status must be cancelled or completed" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("hrms_account_deletion_request_set_status", {
    p_actor_id: session.id,
    p_request_id: id,
    p_status: status,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data ?? { ok: true });
}
