import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { createSessionCookie, getCookieOptions, COOKIE_NAME, type SessionUser } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

function getGoogleClientId(): string | undefined {
  return (
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    undefined
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    if (!idToken) return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    const mode = body?.mode === "signup" ? "signup" : "login";

    const clientId = getGoogleClientId();
    if (!clientId) {
      return NextResponse.json(
        { error: "Google auth not configured (set NEXT_PUBLIC_GOOGLE_CLIENT_ID)" },
        { status: 500 }
      );
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email ? String(payload.email).trim().toLowerCase() : "";
    const name = payload?.name ? String(payload.name).trim() : "";
    const emailVerified = payload?.email_verified === true;

    if (!email) return NextResponse.json({ error: "Google token missing email" }, { status: 400 });
    if (!emailVerified) return NextResponse.json({ error: "Google email is not verified" }, { status: 400 });

    const { data: existing, error: existErr } = await supabase
      .from("HRMS_users")
      .select("id, email, name, role, auth_session_version, employment_status")
      .eq("email", email)
      .maybeSingle();
    if (existErr) throw existErr;

    if (!existing && mode === "login") {
      return NextResponse.json(
        { error: "No account found for this Google email." },
        { status: 404 }
      );
    }

    let userRow = existing as any;
    if (!userRow) {
      // Signup via Google: create local user row WITHOUT password.
      const { data: inserted, error: insErr } = await supabase
        .from("HRMS_users")
        .insert([{
          email,
          password_hash: null,
          auth_provider: "google",
          name: name || null,
          role: "super_admin",
          employment_status: "current",
        }])
        .select("id, email, name, role, auth_session_version, employment_status")
        .single();
      if (insErr) throw insErr;
      userRow = inserted;
    }

    if (String(userRow.employment_status || "").toLowerCase() === "past") {
      return NextResponse.json({ error: "This user is offboarded and cannot sign in." }, { status: 403 });
    }

    const session: SessionUser = {
      id: String(userRow.id),
      email: String(userRow.email),
      name: userRow.name ?? null,
      role: userRow.role,
      sv: Number(userRow.auth_session_version ?? 0),
    };
    const cookie = createSessionCookie(session);
    const res = NextResponse.json({ user: session });
    res.cookies.set(COOKIE_NAME, cookie, getCookieOptions());
    return res;
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Google sign-in failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

