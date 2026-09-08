/**
 * Pure helpers for generated-payroll staleness and recalculation safety.
 * Database writes live in payrollStaleMark.ts.
 */

export const PAYROLL_STATUS_GENERATED = "generated";
export const PAYROLL_STATUS_APPROVED = "approved";
export const PAYROLL_STATUS_FINALIZED = "finalized";
export const PAYROLL_STATUS_PAID = "paid";

export const RECALC_REASON_HR_SOURCE_CHANGE =
  "HR modified attendance/leave after payroll generation";

export type PayrollLifecycleStatus =
  | typeof PAYROLL_STATUS_GENERATED
  | typeof PAYROLL_STATUS_APPROVED
  | typeof PAYROLL_STATUS_FINALIZED
  | typeof PAYROLL_STATUS_PAID;

export function resolvePayrollLifecycleStatus(args: {
  payrollStatus?: string | null;
  periodLocked?: boolean | null;
}): PayrollLifecycleStatus {
  if (args.periodLocked) return PAYROLL_STATUS_FINALIZED;
  const s = String(args.payrollStatus ?? PAYROLL_STATUS_GENERATED).toLowerCase();
  if (s === PAYROLL_STATUS_APPROVED) return PAYROLL_STATUS_APPROVED;
  if (s === PAYROLL_STATUS_FINALIZED) return PAYROLL_STATUS_FINALIZED;
  if (s === PAYROLL_STATUS_PAID) return PAYROLL_STATUS_PAID;
  return PAYROLL_STATUS_GENERATED;
}

export function canOverwritePayroll(status: PayrollLifecycleStatus): boolean {
  return status === PAYROLL_STATUS_GENERATED || status === PAYROLL_STATUS_APPROVED;
}

export function requiresRecalcReason(status: PayrollLifecycleStatus): boolean {
  return status === PAYROLL_STATUS_APPROVED;
}

export function isFinalizedOrPaid(status: PayrollLifecycleStatus): boolean {
  return status === PAYROLL_STATUS_FINALIZED || status === PAYROLL_STATUS_PAID;
}

export type SourceChangeKind =
  | "attendance"
  | "leave"
  | "holiday"
  | "division"
  | "employment_dates"
  | "work_week"
  | "salary_component";

export function holidayAffectsEmployee(args: {
  holidayDivisionId: string | null | undefined;
  employeeDivisionId: string | null | undefined;
}): boolean {
  const hDiv = args.holidayDivisionId ? String(args.holidayDivisionId) : null;
  if (!hDiv) return true;
  const eDiv = args.employeeDivisionId ? String(args.employeeDivisionId) : null;
  return Boolean(eDiv && hDiv === eDiv);
}

export function shouldMarkPayslipStale(args: {
  generatedAtIso: string | null | undefined;
  sourceChangedAtIso: string | null | undefined;
  storedPayableDays: number;
  livePayableDays: number;
}): { stale: boolean; reason: "source" | "formula" | null } {
  const gen = args.generatedAtIso ? Date.parse(args.generatedAtIso) : NaN;
  const src = args.sourceChangedAtIso ? Date.parse(args.sourceChangedAtIso) : NaN;
  if (Number.isFinite(gen) && Number.isFinite(src) && src > gen) {
    return { stale: true, reason: "source" };
  }
  const stored = Math.round((Number(args.storedPayableDays) || 0) * 2) / 2;
  const live = Math.round((Number(args.livePayableDays) || 0) * 2) / 2;
  if (stored !== live) return { stale: true, reason: "formula" };
  return { stale: false, reason: null };
}

export type RecalcAuditRecord = {
  action: "marked_stale" | "preview" | "confirmed";
  reason: string;
  actorUserId: string | null;
  oldBreakdown: unknown;
  newBreakdown: unknown;
  changedSourceRecords: unknown;
};

export function buildRecalcAudit(args: RecalcAuditRecord): RecalcAuditRecord {
  return {
    action: args.action,
    reason: args.reason,
    actorUserId: args.actorUserId,
    oldBreakdown: args.oldBreakdown,
    newBreakdown: args.newBreakdown,
    changedSourceRecords: args.changedSourceRecords,
  };
}
