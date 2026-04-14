import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-side client for storage/admin operations (service role when configured). */
export const supabaseAdmin = createClient(supabaseUrl, serviceKey || anonKey);
