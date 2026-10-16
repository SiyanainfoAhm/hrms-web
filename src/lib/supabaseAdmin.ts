import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY. Server-side HRMS routes require the Supabase service-role key; never expose it with a NEXT_PUBLIC_ prefix.",
  );
}

/**
 * Server-only database client for routes which have already performed their own
 * cookie/token authorization. The service-role key bypasses RLS, so this must
 * never be imported by a browser component or exposed in a public environment.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
