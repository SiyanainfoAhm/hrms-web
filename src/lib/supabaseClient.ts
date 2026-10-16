import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const isServer = typeof window === "undefined";
// `SUPABASE_SERVICE_ROLE_KEY` is never exposed to browser bundles because it
// has no NEXT_PUBLIC_ prefix. API routes use it only after their own signed
// session, invite-token, or webhook-secret checks have succeeded.
const serverServiceRoleKey = isServer ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() : undefined;

if (!supabaseUrl || (!isServer && !supabaseAnonKey) || (isServer && !serverServiceRoleKey)) {
  throw new Error(
    isServer
      ? "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Server API routes require the service-role key when RLS is enabled."
      : "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and add your Supabase project values, then restart `npm run dev`.",
  );
}

/**
 * Browser code uses the publishable/anon key and must be covered by RLS.
 * Server route handlers use the service-role key after application-level
 * authorization, allowing HRMS tables to remain closed to direct Data API use.
 */
export const supabase = createClient(supabaseUrl, isServer ? serverServiceRoleKey! : supabaseAnonKey!, {
  auth: { persistSession: !isServer, autoRefreshToken: !isServer },
});

