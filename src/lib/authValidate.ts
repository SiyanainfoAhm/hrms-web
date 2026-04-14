import { getSessionFromCookie, type SessionUser } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

/** Validates signed cookie and that session version matches DB (password not rotated elsewhere). */
export async function getValidatedSession(cookieValue: string | undefined): Promise<SessionUser | null> {
  const session = getSessionFromCookie(cookieValue);
  if (!session) return null;
  const cookieSv = session.sv ?? 0;
  const { data, error } = await supabase
    .from("HRMS_users")
    .select("auth_session_version")
    .eq("id", session.id)
    .maybeSingle();
  if (error || !data) return null;
  const dbSv = Number(data.auth_session_version ?? 0);
  if (cookieSv !== dbSv) return null;
  return session;
}
