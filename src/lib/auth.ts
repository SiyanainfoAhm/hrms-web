import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "hrms_session";
const DEFAULT_SECRET = "hrms-dev-secret-change-in-production";

function getSecret(): string {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "super_admin" | "admin" | "hr" | "manager" | "employee";
  /** Incremented on password change; must match HRMS_users.auth_session_version. */
  sv?: number;
};

export function signPayload(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionCookie(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user), "utf-8").toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function getSessionFromCookie(cookieValue: string | undefined): SessionUser | null {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return null;
  try {
    const expectedSig = signPayload(payload);
    if (expectedSig.length !== signature.length || !timingSafeEqual(Buffer.from(expectedSig, "utf-8"), Buffer.from(signature, "utf-8"))) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as SessionUser;
    if (decoded?.id && decoded?.email && decoded?.role) return decoded;
  } catch {
    return null;
  }
  return null;
}

export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
  };
}

export { COOKIE_NAME };
