import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { createSessionCookie, getCookieOptions, COOKIE_NAME, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateUniqueEmployeeCode } from "@/lib/users";

/**
 * Must match the OAuth **Web** client id used by `GoogleAuthButton` (GIS).
 * Prefer the public web id first so a separate `GOOGLE_CLIENT_ID` (e.g. server/Android)
 * does not break `verifyIdToken` audience checks.
 */
function getGoogleClientId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    undefined
  );
}

function isGoogleEmailVerified(payload: { email_verified?: boolean | string } | undefined): boolean {
  const v = payload?.email_verified;
  return v === true || v === "true";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    if (!idToken) return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    const mode = body?.mode === "signup" ? "signup" : "login";
    const companyName =
      typeof body?.companyName === "string" ? String(body.companyName).trim() : "";

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
    const emailVerified = isGoogleEmailVerified(payload);

    if (!email) return NextResponse.json({ error: "Google token missing email" }, { status: 400 });
    if (!emailVerified) return NextResponse.json({ error: "Google email is not verified" }, { status: 400 });

    const { data: existing, error: existErr } = await supabaseAdmin
      .from("HRMS_users")
      .select("id, email, name, role, auth_session_version, employment_status")
      .eq("email", email)
      .maybeSingle();
    if (existErr) throw existErr;

    const hadExistingUserBeforeRequest = existing != null;
    let userRow = existing as any;

    if (!userRow) {
      if (mode === "signup" && companyName) {
        const orgCode = `ORG-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
        const { data: comp, error: cInsErr } = await supabaseAdmin
          .from("HRMS_companies")
          .insert([{ name: companyName, code: orgCode }])
          .select("id")
          .single();
        if (cInsErr) throw cInsErr;
        const companyId = (comp as { id: string }).id;
        const employee_code = await generateUniqueEmployeeCode();
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("HRMS_users")
          .insert([
            {
              email,
              password_hash: null,
              auth_provider: "google",
              name: name || null,
              role: "super_admin",
              employment_status: "current",
              employee_code,
              company_id: companyId,
            },
          ])
          .select("id, email, name, role, auth_session_version, employment_status")
          .single();
        if (insErr) {
          const msg = typeof insErr.message === "string" ? insErr.message.toLowerCase() : "";
          if (msg.includes("duplicate") || msg.includes("unique")) {
            return NextResponse.json({ error: "User already exists. Sign in instead or use a different email." }, { status: 400 });
          }
          throw insErr;
        }
        userRow = inserted;
      } else {
        return NextResponse.json(
          {
            error:
              "User does not exist. Ask your Super Admin to add you in HRMS, or use mobile signup with your company name to create an account with Google.",
          },
          { status: 404 }
        );
      }
    }

    // Signup must create a new account; do not silently sign in an existing user (matches `hrms_signup` / email-password flow).
    if (mode === "signup" && hadExistingUserBeforeRequest) {
      return NextResponse.json(
        { error: "User already exists. Sign in instead or use a different email." },
        { status: 400 }
      );
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
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Google sign-in failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
