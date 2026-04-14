/** Shared rules for employee identity fields (Add employee + API). */

export function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function validateEmailField(v: string): string | null {
  const value = v.trim().toLowerCase();
  if (!value) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email (e.g. name@company.com)";
  return null;
}

/** 10-digit Indian mobile (starts with 6–9). */
export function validateIndianMobileDigits(digits: string): string | null {
  if (!digits) return "Phone is required";
  if (digits.length !== 10) return "Phone must be exactly 10 digits";
  if (!/^[6-9]\d{9}$/.test(digits)) return "Enter a valid Indian mobile number (starts with 6–9)";
  return null;
}

export function validateAadhaarDigits(digits: string): string | null {
  if (!digits) return "Aadhaar is required";
  if (digits.length !== 12) return "Aadhaar must be exactly 12 digits";
  if (!/^\d{12}$/.test(digits)) return "Aadhaar must contain only digits";
  return null;
}

/** Blur / progressive UX: length progress, then full rules (incl. Indian mobile prefix). */
export function validateIndianMobileInteractive(digits: string): string | null {
  if (!digits) return "Phone is required";
  if (digits.length < 10) return `Enter 10 digits (${digits.length}/10)`;
  return validateIndianMobileDigits(digits);
}

export function validateAadhaarInteractive(digits: string): string | null {
  if (!digits) return "Aadhaar is required";
  if (digits.length < 12) return `Enter 12 digits (${digits.length}/12)`;
  return validateAadhaarDigits(digits);
}

/** PAN after normalizing to uppercase A–Z/0–9 only, length 10. */
export function validatePanNormalized(pan: string): string | null {
  const u = pan.trim().toUpperCase();
  if (!u) return "PAN is required";
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(u)) {
    return "PAN must be like ABCDE1234F (5 letters, 4 digits, 1 letter)";
  }
  return null;
}

export function normalizePanInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}
