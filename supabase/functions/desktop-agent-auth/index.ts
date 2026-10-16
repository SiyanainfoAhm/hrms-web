import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import bcrypt from "npm:bcryptjs@3.0.3";

type LoginBody = {
  action: "login";
  email?: string;
  password?: string;
  deviceName?: string | null;
  appVersion?: string | null;
};

type HeartbeatBody = {
  action: "heartbeat";
  token?: string;
  deviceName?: string | null;
  appVersion?: string | null;
};

type RequestBody = LoginBody | HeartbeatBody;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  // The packaged Tauri frontend is served from tauri://localhost, so the
  // function must answer the browser WebView's preflight request.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function text(value: unknown, limit: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function signingKey() {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing server signing key.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(payload: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function issueToken(payload: Record<string, unknown>) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded)}`;
}

async function readToken(token: string) {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((signature.length + 3) % 4)), (char) => char.charCodeAt(0)),
    new TextEncoder().encode(encoded),
  );
  if (!valid) return null;
  const value = JSON.parse(base64UrlDecode(encoded));
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

/**
 * This function intentionally uses custom authentication (`verify_jwt: false`)
 * because HRMS uses its own bcrypt-backed account table rather than Supabase
 * Auth. It exposes neither password hashes nor the service-role key.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json() as RequestBody;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (body.action === "login") {
      const email = text(body.email, 254)?.toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) return json({ error: "Email and password are required." }, 400);

      const { data: user, error: userError } = await supabase
        .from("HRMS_users")
        .select("id, email, name, role, company_id, auth_provider, employment_status, password_hash, auth_session_version")
        .eq("email", email)
        .maybeSingle();
      if (userError) throw userError;

      const valid = Boolean(
        user &&
        (user as any).auth_provider !== "google" &&
        (user as any).employment_status === "current" &&
        (user as any).password_hash &&
        await bcrypt.compare(password, String((user as any).password_hash)),
      );
      if (!valid) return json({ error: "Email or password is incorrect." }, 401);

      const { data: employee, error: employeeError } = await supabase
        .from("HRMS_employees")
        .select("id, is_active")
        .eq("company_id", (user as any).company_id)
        .eq("user_id", (user as any).id)
        .maybeSingle();
      if (employeeError) throw employeeError;
      if (!employee?.id || (employee as any).is_active === false) {
        return json({ error: "Your employee profile is not active. Contact HR." }, 403);
      }

      const token = await issueToken({
        userId: (user as any).id,
        companyId: (user as any).company_id,
        employeeId: employee.id,
        sessionVersion: Number((user as any).auth_session_version ?? 0),
        exp: Date.now() + TOKEN_TTL_MS,
      });

      return json({
        user: {
          id: (user as any).id,
          email: (user as any).email,
          name: (user as any).name,
          role: (user as any).role,
          authProvider: "password",
          companyId: (user as any).company_id,
        },
        agentToken: token,
      });
    }

    if (body.action === "heartbeat") {
      // A signed token contains three UUIDs plus the signature, so it is
      // normally a little over 300 characters. Keep a generous upper bound
      // while still rejecting implausibly large request bodies.
      const token = text(body.token, 2048);
      if (!token) return json({ error: "Desktop session is required." }, 401);

      const claims = await readToken(token);
      if (!claims || Number(claims.exp) <= Date.now()) {
        return json({ error: "Desktop session expired. Sign in again." }, 401);
      }

      const { data: currentUser, error: currentUserError } = await supabase
        .from("HRMS_users")
        .select("company_id, employment_status, auth_session_version")
        .eq("id", String(claims.userId ?? ""))
        .maybeSingle();
      if (currentUserError) throw currentUserError;
      if (
        !currentUser ||
        (currentUser as any).employment_status !== "current" ||
        String((currentUser as any).company_id) !== String(claims.companyId) ||
        Number((currentUser as any).auth_session_version ?? 0) !== Number(claims.sessionVersion)
      ) {
        return json({ error: "Desktop session expired. Sign in again." }, 401);
      }

      const now = new Date().toISOString();

      const { error: heartbeatError } = await supabase.from("HRMS_agent_heartbeat").upsert(
        {
          company_id: String(claims.companyId),
          employee_id: String(claims.employeeId),
          status: "ONLINE",
          last_seen_at: now,
          app_version: text(body.appVersion, 120),
          device_name: text(body.deviceName, 160),
        },
        { onConflict: "company_id,employee_id" },
      );
      if (heartbeatError) throw heartbeatError;

      return json({ ok: true, companyId: String(claims.companyId), employeeId: String(claims.employeeId) });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("desktop-agent-auth failed", error);
    return json({ error: "Desktop agent authentication is temporarily unavailable." }, 500);
  }
});
