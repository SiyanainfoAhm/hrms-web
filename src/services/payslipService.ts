/**
 * Wrapper around /api/payslips/me. Returns the employee's most recent
 * payslip summary (period, generated date, pay days, net pay).
 *
 * The chatbot only ever calls the "me" endpoint; HR/Admin lookup of
 * another employee's payslip continues to go through the dedicated
 * payroll screens, since that involves the payslip preview UI which
 * is intentionally outside chat scope.
 */

export type PayslipSummary = {
  periodMonth?: string;
  periodFormatted?: string;
  generatedAt?: string;
  payDays?: number | null;
  netPay?: number | null;
};

export async function getMyPayslips(): Promise<PayslipSummary[]> {
  const res = await fetch("/api/payslips/me");
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const list = Array.isArray((data as { payslips?: unknown }).payslips)
    ? ((data as { payslips: unknown[] }).payslips as PayslipSummary[])
    : [];
  return list;
}

export async function getMyLatestPayslip(): Promise<PayslipSummary | null> {
  const list = await getMyPayslips();
  return list.length > 0 ? list[0] : null;
}
