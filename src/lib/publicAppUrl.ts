/**
 * Public HTTPS origin for email CTAs and mobile config parity (no trailing slash).
 * Vercel sets `VERCEL_URL` (hostname only) at build/runtime when env URLs are omitted.
 */
const DEFAULT_PRODUCTION_ORIGIN = "https://hrms-web-rage.vercel.app";

export function getPublicAppUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }

  return DEFAULT_PRODUCTION_ORIGIN.replace(/\/$/, "");
}
