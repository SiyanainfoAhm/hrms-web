/** Normalize phone values from API/DB (string or number) for display. */
export function coercePhoneString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function coercePhoneOptional(value: unknown): string | undefined {
  const s = coercePhoneString(value);
  return s || undefined;
}
