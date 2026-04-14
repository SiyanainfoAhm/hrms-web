import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, verifyPassword } from "@/lib/users";
import { createSessionCookie, getCookieOptions, COOKIE_NAME, type SessionUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if ((user as any).authProvider && (user as any).authProvider !== "password") {
      return NextResponse.json({ error: "This account uses Google sign-in. Please continue with Google." }, { status: 400 });
    }

    const ok = await verifyPassword(user, password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const session: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sv: user.authSessionVersion,
    };
    const cookie = createSessionCookie(session);
    const res = NextResponse.json({ user: session });
    res.cookies.set(COOKIE_NAME, cookie, getCookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
