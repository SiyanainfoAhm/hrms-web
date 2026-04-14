import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, createSessionCookie, getCookieOptions, type SessionUser } from "@/lib/auth";
import { getValidatedSession } from "@/lib/authValidate";
import { changePasswordForUser } from "@/lib/users";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getValidatedSession(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block password change for OAuth-only accounts.
  const { data: userRow, error: userErr } = await supabase
    .from("HRMS_users")
    .select("auth_provider")
    .eq("id", session.id)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 400 });
  if ((userRow?.auth_provider ?? "password") !== "password") {
    return NextResponse.json({ error: "This account uses Google sign-in and has no password." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
  }

  try {
    const newSv = await changePasswordForUser(session.id, currentPassword, newPassword);
    const next: SessionUser = { ...session, sv: newSv };
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, createSessionCookie(next), getCookieOptions());
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to change password";
    if (msg === "Current password is incorrect") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
