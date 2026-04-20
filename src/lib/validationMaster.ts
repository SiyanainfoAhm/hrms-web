export function validateRequired(v: unknown, label: string): string | null {
  if (v == null) return `${label} is required`;
  if (typeof v === "boolean") return v ? null : `${label} is required`;
  if (typeof v === "number") return Number.isFinite(v) ? null : `${label} is required`;
  const s = String(v).trim();
  return s ? null : `${label} is required`;
}

export function validatePositiveNumber(v: unknown, label: string): string | null {
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 0) return `${label} must be greater than zero`;
  return null;
}

export function validateIsoDateRequired(v: unknown, label: string): string | null {
  const s = String(v ?? "").slice(0, 10);
  if (!s) return `${label} is required`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${label} must be a valid date`;
  return null;
}

