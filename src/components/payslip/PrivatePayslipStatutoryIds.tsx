import { payslipStatutoryIdLines, type PayslipStatutoryUserFields } from "@/lib/privatePayslipDisplay";

export function PrivatePayslipStatutoryIds({
  user,
}: {
  user: PayslipStatutoryUserFields | null | undefined;
}) {
  const lines = payslipStatutoryIdLines(user);
  if (!lines.length) return null;
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map(({ label, value }) => (
        <div key={label}>
          <span className="text-slate-600">{label}:</span> {value}
        </div>
      ))}
    </div>
  );
}
