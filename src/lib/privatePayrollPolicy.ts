import { normalizePrivatePayrollConfig, type PrivatePayrollConfig } from "@/lib/payrollConfig";

export type PrivatePayrollPolicyRow = {
  effective_from?: string | null;
  effective_to?: string | null;
  private_config?: unknown;
};

const ymd = (value: unknown) => String(value ?? "").slice(0, 10);

/** Select the latest inclusive effective policy; legacy config is the safe fallback. */
export function applicablePrivatePayrollPolicy(
  payrollMonth: string,
  policies: PrivatePayrollPolicyRow[] | null | undefined,
  legacyConfig?: unknown,
): PrivatePayrollConfig {
  const month = ymd(payrollMonth);
  const matches = (policies ?? [])
    .filter((p) => {
      const from = ymd(p.effective_from) || "0000-01-01";
      const to = ymd(p.effective_to);
      return from <= month && (!to || month <= to);
    })
    .sort((a, b) => ymd(b.effective_from).localeCompare(ymd(a.effective_from)));
  return normalizePrivatePayrollConfig(matches[0]?.private_config ?? legacyConfig);
}
