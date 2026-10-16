import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const isServer = typeof window === "undefined";
// `SUPABASE_SERVICE_ROLE_KEY` is never exposed to browser bundles because it
// has no NEXT_PUBLIC_ prefix. API routes use it only after their own signed
// session, invite-token, or webhook-secret checks have succeeded.
const serverServiceRoleKey = isServer ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() : undefined;
const configurationError = !supabaseUrl
  ? "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local and configure Supabase."
  : isServer && !serverServiceRoleKey
    ? "Missing SUPABASE_SERVICE_ROLE_KEY. Server API routes require the service-role key when RLS is enabled."
    : !isServer && !supabaseAnonKey
      ? "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and configure Supabase."
      : null;

/**
 * Browser code uses the publishable/anon key and must be covered by RLS.
 * Server route handlers use the service-role key after application-level
 * authorization, allowing HRMS tables to remain closed to direct Data API use.
 *
 * A placeholder client keeps `next build` from failing while it evaluates route
 * modules. At runtime, any attempted query fails with the clear configuration
 * message below instead of sending a request with a fallback credential.
 */
export const supabase = createClient(
  supabaseUrl || "https://missing-supabase-config.invalid",
  (isServer ? serverServiceRoleKey : supabaseAnonKey) || "missing-supabase-key",
  {
    auth: { persistSession: !isServer, autoRefreshToken: !isServer },
    global: configurationError
      ? { fetch: () => Promise.reject(new Error(configurationError)) }
      : undefined,
  },
);

