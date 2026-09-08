import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  RECALC_REASON_HR_SOURCE_CHANGE,
  canOverwritePayroll,
  holidayAffectsEmployee,
  resolvePayrollLifecycleStatus,
  type SourceChangeKind,
} from "@/lib/payrollStaleDetection";

type MarkArgs = {
  companyId: string;
  actorUserId: string | null;
  reason?: string;
  summary: string;
  kind: SourceChangeKind;
  employeeUserIds?: string[];
  dateStartYmd?: string | null;
  dateEndYmd?: string | null;
  holidayDivisionId?: string | null;
};

function ymd(v: string | null | undefined): string | null {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function markGeneratedPayrollOutdated(args: MarkArgs): Promise<{ marked: number }> {
  try {
    return await markGeneratedPayrollOutdatedUnsafe(args);
  } catch {
    return { marked: 0 };
  }
}

async function markGeneratedPayrollOutdatedUnsafe(args: MarkArgs): Promise<{ marked: number }> {
  const db = supabaseAdmin;
  const start = ymd(args.dateStartYmd) ?? "1900-01-01";
  const end = ymd(args.dateEndYmd) ?? ymd(args.dateStartYmd) ?? "9999-12-31";
  const reason = args.reason || RECALC_REASON_HR_SOURCE_CHANGE;
  const now = new Date().toISOString();

  const { data: periods, error: pErr } = await db
    .from("HRMS_payroll_periods")
    .select("id, period_start, period_end, is_locked")
    .eq("company_id", args.companyId)
    .lte("period_start", end)
    .gte("period_end", start);
  if (pErr || !periods?.length) return { marked: 0 };

  let marked = 0;
  for (const period of periods) {
    const status = resolvePayrollLifecycleStatus({
      periodLocked: Boolean((period as { is_locked?: boolean }).is_locked),
    });
    if (!canOverwritePayroll(status)) continue;

    let slipQ = db
      .from("HRMS_payslips")
      .select("id, employee_user_id, pay_days, payable_days_breakdown, payroll_status, generated_at")
      .eq("company_id", args.companyId)
      .eq("payroll_period_id", period.id);

    if (args.employeeUserIds?.length) {
      slipQ = slipQ.in("employee_user_id", args.employeeUserIds);
    }

    const { data: slips, error: sErr } = await slipQ;
    if (sErr || !slips?.length) continue;

    let target = slips as Array<{
      id: string;
      employee_user_id: string;
      pay_days: number | null;
      payable_days_breakdown: unknown;
      payroll_status?: string | null;
      generated_at?: string | null;
    }>;

    if (args.kind === "holiday" && !args.employeeUserIds?.length) {
      const uids = [...new Set(target.map((s) => s.employee_user_id).filter(Boolean))];
      const { data: emps } = await db
        .from("HRMS_employees")
        .select("user_id, division_id")
        .eq("company_id", args.companyId)
        .in("user_id", uids);
      const divByUser = new Map(
        (emps ?? []).map((e: { user_id: string; division_id: string | null }) => [
          String(e.user_id),
          e.division_id ? String(e.division_id) : null,
        ]),
      );
      target = target.filter((s) =>
        holidayAffectsEmployee({
          holidayDivisionId: args.holidayDivisionId,
          employeeDivisionId: divByUser.get(s.employee_user_id) ?? null,
        }),
      );
    }

    for (const slip of target) {
      const slipStatus = resolvePayrollLifecycleStatus({
        payrollStatus: slip.payroll_status,
        periodLocked: Boolean((period as { is_locked?: boolean }).is_locked),
      });
      if (!canOverwritePayroll(slipStatus)) continue;

      const { error: upErr } = await db
        .from("HRMS_payslips")
        .update({
          recalculation_required: true,
          recalculation_reason: reason,
          source_changed_at: now,
          source_changed_by: args.actorUserId,
          source_change_summary: args.summary,
        })
        .eq("id", slip.id);
      if (upErr) continue;

      await db.from("HRMS_payroll_recalc_audit").insert({
        company_id: args.companyId,
        payroll_period_id: period.id,
        payslip_id: slip.id,
        employee_user_id: slip.employee_user_id,
        action: "marked_stale",
        reason,
        actor_user_id: args.actorUserId,
        old_breakdown: slip.payable_days_breakdown ?? { payDays: slip.pay_days },
        new_breakdown: null,
        changed_source_records: { kind: args.kind, summary: args.summary },
      });
      marked += 1;
    }
  }
  return { marked };
}
