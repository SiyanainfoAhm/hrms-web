export type LeaveBalanceAdjustment = {
  leave_type_id: string;
  adjustment_days: number;
  effective_from: string;
};

export function mapAdjustmentRows(rows: unknown[]): LeaveBalanceAdjustment[] {
  return (rows ?? []).map((r: any) => ({
    leave_type_id: String(r.leave_type_id),
    adjustment_days: Number(r.adjustment_days) || 0,
    effective_from: String(r.effective_from).slice(0, 10),
  }));
}

export function sumAdjustmentDays(
  adjustments: LeaveBalanceAdjustment[],
  leaveTypeId: string,
  asOfYmd: string,
): number {
  return adjustments
    .filter((a) => a.leave_type_id === leaveTypeId && a.effective_from <= asOfYmd)
    .reduce((sum, a) => sum + a.adjustment_days, 0);
}

export async function loadLeaveBalanceAdjustments(
  supabase: { from: (table: string) => any },
  companyId: string,
  employeeUserId: string,
): Promise<LeaveBalanceAdjustment[]> {
  const { data, error } = await supabase
    .from("HRMS_leave_balance_adjustments")
    .select("leave_type_id, adjustment_days, effective_from")
    .eq("company_id", companyId)
    .eq("employee_user_id", employeeUserId);
  if (error) throw error;
  return mapAdjustmentRows(data ?? []);
}

export async function loadLeaveBalanceAdjustmentsForUsers(
  supabase: { from: (table: string) => any },
  companyId: string,
  userIds: string[],
): Promise<Map<string, LeaveBalanceAdjustment[]>> {
  const map = new Map<string, LeaveBalanceAdjustment[]>();
  if (!userIds.length) return map;

  const { data, error } = await supabase
    .from("HRMS_leave_balance_adjustments")
    .select("employee_user_id, leave_type_id, adjustment_days, effective_from")
    .eq("company_id", companyId)
    .in("employee_user_id", userIds);
  if (error) throw error;

  for (const r of data ?? []) {
    const uid = String((r as any).employee_user_id);
    const arr = map.get(uid) || [];
    arr.push({
      leave_type_id: String((r as any).leave_type_id),
      adjustment_days: Number((r as any).adjustment_days) || 0,
      effective_from: String((r as any).effective_from).slice(0, 10),
    });
    map.set(uid, arr);
  }
  return map;
}
