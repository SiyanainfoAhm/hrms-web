/**
 * Indian bank field validation (NEFT/IMPS style).
 * IFSC: 11 chars, e.g. SBIN0001234 (4 letters + 0 + 6 alphanumeric branch code).
 * Account: digits only, typical retail length 9–18; allow up to 34 per RBI upper bound.
 */

export function normalizeBankAccountDigits(s: string): string {
  return String(s || "").replace(/\s+/g, "");
}

export function validateIndianBankAccountNumber(raw: string): string | null {
  const d = normalizeBankAccountDigits(raw);
  if (!d) return "Bank account number is required";
  if (!/^\d+$/.test(d)) return "Account number must contain digits only (no spaces or letters)";
  if (d.length < 9 || d.length > 34) return "Account number must be 9–34 digits";
  return null;
}

export function normalizeIndianIfsc(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Returns null if valid, else error message. */
export function validateIndianIfsc(raw: string): string | null {
  const v = normalizeIndianIfsc(raw);
  if (!v) return "IFSC is required";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
    return "IFSC must be 11 characters: 4 letters, digit 0, then 6 characters (e.g. PUNB0981200)";
  }
  return null;
}
