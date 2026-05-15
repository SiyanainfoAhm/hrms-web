import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findUserByEmail, verifyPassword, type User } from "@/lib/users";

export const ACCOUNT_DELETION_GRACE_DAYS = 90;

export function scheduledDeletionDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + ACCOUNT_DELETION_GRACE_DAYS);
  return d;
}

export function canRequestAccountDeletion(user: User): string | null {
  if (user.role === "super_admin") {
    return "Super admin accounts cannot be deleted through this form. Contact support.";
  }
  if (user.authProvider === "google" && !user.passwordHash) {
    return "This account uses Google sign-in only. Contact your company super admin or support@siyanainfo.com to request deletion.";
  }
  if (!user.passwordHash) {
    return "This account has no password set. Contact your super admin to request deletion.";
  }
  return null;
}

export async function submitAccountDeletionRequest(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) {
    return { ok: false as const, error: "Invalid email or password", status: 401 };
  }

  const blocked = canRequestAccountDeletion(user);
  if (blocked) {
    return { ok: false as const, error: blocked, status: 400 };
  }

  const passwordOk = await verifyPassword(user, password);
  if (!passwordOk) {
    return { ok: false as const, error: "Invalid email or password", status: 401 };
  }

  const { data: companyRow } = await supabaseAdmin
    .from("HRMS_users")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  const companyId = companyRow?.company_id;
  if (!companyId) {
    return { ok: false as const, error: "Account is not linked to a company.", status: 400 };
  }

  const { data: existing } = await supabaseAdmin
    .from("HRMS_account_deletion_requests")
    .select("id, status, scheduled_deletion_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return {
      ok: true as const,
      alreadyPending: true,
      scheduledDeletionAt: existing.scheduled_deletion_at,
    };
  }

  const requestedAt = new Date();
  const scheduledAt = scheduledDeletionDate(requestedAt);

  const { error: insErr } = await supabaseAdmin.from("HRMS_account_deletion_requests").insert([
    {
      company_id: companyId,
      user_id: user.id,
      email: user.email,
      status: "pending",
      requested_at: requestedAt.toISOString(),
      scheduled_deletion_at: scheduledAt.toISOString(),
    },
  ]);

  if (insErr) {
    return { ok: false as const, error: insErr.message, status: 400 };
  }

  // Revoke active sessions immediately; data removed after scheduled date (or super-admin action).
  await supabaseAdmin
    .from("HRMS_users")
    .update({
      auth_session_version: (user.authSessionVersion ?? 0) + 1,
      employment_status: "past",
      updated_at: requestedAt.toISOString(),
    })
    .eq("id", user.id);

  await supabaseAdmin
    .from("HRMS_employees")
    .update({ is_active: false, updated_at: requestedAt.toISOString() })
    .eq("user_id", user.id);

  return {
    ok: true as const,
    scheduledDeletionAt: scheduledAt.toISOString(),
  };
}
