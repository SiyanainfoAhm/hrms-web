export type PowerAutomateEmailPayload = {
  toEmail: string;
  subject: string;
  body: string;
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

function getWebhookUrl(): string | undefined {
  // Preferred generic name; fall back to older leave-specific envs for compatibility.
  const u =
    process.env.POWER_AUTOMATE_EMAIL_URL?.trim() ||
    process.env.POWER_AUTOMATE_LEAVE_URL?.trim() ||
    process.env.EMAIL_EDGE_URL?.trim() ||
    process.env.LEAVE_EMAIL_EDGE_URL?.trim();
  return u || undefined;
}

function getWebhookSecret(): string | undefined {
  const s =
    process.env.POWER_AUTOMATE_EMAIL_SECRET?.trim() ||
    process.env.POWER_AUTOMATE_LEAVE_SECRET?.trim() ||
    process.env.EMAIL_EDGE_SECRET?.trim() ||
    process.env.LEAVE_EMAIL_EDGE_SECRET?.trim();
  return s || undefined;
}

/** Best-effort webhook call to Power Automate. */
export async function sendPowerAutomateEmail(payload: PowerAutomateEmailPayload): Promise<SendEmailResult> {
  const hookUrl = getWebhookUrl();
  if (!hookUrl) {
    return {
      ok: false,
      error: "Email webhook not configured. Set POWER_AUTOMATE_EMAIL_URL (or POWER_AUTOMATE_LEAVE_URL).",
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = getWebhookSecret();
  if (secret) headers["x-hrms-email-secret"] = secret;

  const res = await fetch(hookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: t || `Webhook error (${res.status})` };
  }
  return { ok: true };
}

