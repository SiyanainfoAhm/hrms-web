import type { NextRequest } from "next/server";

export function getRequestAppBaseUrl(request: NextRequest): string {
  const envBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (envBase) return envBase;
  return new URL(request.url).origin;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inviteEmailSubject(companyName: string | null | undefined): string {
  const n = companyName?.trim();
  return n ? `${n} — complete your onboarding` : "HRMS — complete your onboarding";
}

/** HTML email body with a primary “click here” CTA for the invite link. */
export function buildInviteEmailHtml(opts: {
  inviteUrl: string;
  recipientName?: string | null;
  companyName?: string | null;
}): string {
  const greeting = opts.recipientName?.trim()
    ? `Hello ${escapeHtml(opts.recipientName.trim())},`
    : "Hello,";
  const org = opts.companyName?.trim()
    ? `Your organization, <strong>${escapeHtml(opts.companyName.trim())}</strong>,`
    : "Your organization";
  const url = escapeHtml(opts.inviteUrl);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;color:#0f172a;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;box-shadow:0 10px 40px rgba(15,23,42,0.06);">
        <tr><td style="padding:32px 28px 28px;">
          <p style="margin:0 0 14px;font-size:16px;">${greeting}</p>
          <p style="margin:0 0 22px;font-size:15px;color:#334155;">${org} has invited you to complete your preboarding in <strong>HRMS</strong>. Use the secure link below to upload documents and confirm your details. This link is valid for <strong>48 hours</strong>.</p>
          <p style="margin:0 0 26px;text-align:center;">
            <a href="${url}" style="display:inline-block;background:#047857;color:#ffffff !important;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">Click here to open your invite</a>
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:8px 0 0;font-size:12px;word-break:break-all;color:#0f766e;">${url}</p>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">This is an automated message from HRMS.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type SendInviteEmailResult = { ok: true } | { ok: false; error: string };

/** JSON POSTed to Power Automate — light payload; compose HTML in the flow (see `src/email-templates/hrms-invite-power-automate-body.html`). */
export type InviteEmailWebhookPayload = {
  email: string;
  link: string;
  name: string;
  companyName: string;
  subject: string;
};

function getInviteWebhookUrl(): string | undefined {
  const u = process.env.POWER_AUTOMATE_INVITE_URL?.trim() || process.env.INVITE_EMAIL_EDGE_URL?.trim();
  return u || undefined;
}

/** Optional; if set, sent as header `x-hrms-invite-secret` (Power Automate can validate in the flow). */
function getInviteWebhookSecret(): string | undefined {
  const s =
    process.env.POWER_AUTOMATE_INVITE_SECRET?.trim() ||
    process.env.INVITE_EMAIL_EDGE_SECRET?.trim();
  return s || undefined;
}

function getSupabaseInviteFunctionUrl(): string | undefined {
  return process.env.SUPABASE_SEND_HRMS_INVITE_FUNCTION_URL?.trim();
}

/**
 * Sends the invite email (first match wins):
 * 1) **Supabase Edge** — body `{ userId, companyId, link }`. Edge POSTs: `{ email, link, name, companyName, subject }` (no html).
 * 2) **Direct Power Automate** — same JSON shape.
 * 3) **Resend** — `RESEND_API_KEY` + `EMAIL_FROM` (HTML built in this app).
 */
export async function sendInviteEmail(args: {
  to: string;
  inviteUrl: string;
  recipientName?: string | null;
  companyName?: string | null;
  /** Required for Supabase Edge delivery path. */
  userId?: string;
  companyId?: string;
}): Promise<SendInviteEmailResult> {
  const edgeUrl = getSupabaseInviteFunctionUrl();
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (edgeUrl && supabaseAnon && args.userId && args.companyId) {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnon}`,
        apikey: supabaseAnon,
      },
      body: JSON.stringify({
        userId: args.userId,
        companyId: args.companyId,
        link: args.inviteUrl,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok || data.success === false) {
      const msg = typeof data.message === "string" ? data.message : `Edge error (${res.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  }

  const hookUrl = getInviteWebhookUrl();

  const subject = inviteEmailSubject(args.companyName);
  const payload: InviteEmailWebhookPayload = {
    email: args.to,
    link: args.inviteUrl,
    name: (args.recipientName ?? "").trim(),
    companyName: (args.companyName ?? "").trim(),
    subject,
  };

  if (hookUrl) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = getInviteWebhookSecret();
    if (secret) headers["x-hrms-invite-secret"] = secret;

    const res = await fetch(hookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: t || `Webhook error (${res.status})` };
    }
    return { ok: true };
  }

  const from = process.env.EMAIL_FROM?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!from || !resendKey) {
    return {
      ok: false,
      error:
        "Email not configured. Set SUPABASE_SEND_HRMS_INVITE_FUNCTION_URL (Edge → Power Automate JSON), or POWER_AUTOMATE_INVITE_URL (same JSON), or RESEND_API_KEY + EMAIL_FROM.",
    };
  }

  const html = buildInviteEmailHtml({
    inviteUrl: args.inviteUrl,
    recipientName: args.recipientName,
    companyName: args.companyName,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject,
      html,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    const msg = typeof data?.message === "string" ? data.message : res.statusText;
    return { ok: false, error: msg };
  }
  return { ok: true };
}
