import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionCookie,
  getSessionFromCookie,
  getCookieOptions,
  COOKIE_NAME,
  type SessionUser,
} from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  const session = getSessionFromCookie(cookie);
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const { data, error } = await supabase
    .from("HRMS_users")
    .select("auth_session_version")
    .eq("id", session.id)
    .maybeSingle();

  if (error || !data) {
    const res = NextResponse.json({ user: null });
    res.cookies.set(COOKIE_NAME, "", { ...getCookieOptions(), maxAge: 0 });
    return res;
  }

  const dbSv = Number(data.auth_session_version ?? 0);
  if ((session.sv ?? 0) !== dbSv) {
    const res = NextResponse.json({ user: null });
    res.cookies.set(COOKIE_NAME, "", { ...getCookieOptions(), maxAge: 0 });
    return res;
  }

  const next: SessionUser = { ...session, sv: dbSv };
  const res = NextResponse.json({ user: next });
  res.cookies.set(COOKIE_NAME, createSessionCookie(next), getCookieOptions());
  return res;
}
