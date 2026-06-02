export function isExplicitlyTrue(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "t" || v === "TRUE" || v === "1";
}

export function isExplicitlyFalse(v: unknown): boolean {
  return v === false || v === 0 || v === "false" || v === "f" || v === "FALSE" || v === "0";
}

/** Prefer payroll master flags; fall back to employee (`HRMS_users`) when master columns are null. */
export function privatePfEligibleMerged(m: Record<string, unknown>, u?: Record<string, unknown> | null): boolean {
  if (isExplicitlyFalse(m.pf_eligible)) return false;
  if (isExplicitlyTrue(m.pf_eligible)) return true;
  if (u) {
    if (isExplicitlyFalse(u.pf_eligible)) return false;
    if (isExplicitlyTrue(u.pf_eligible)) return true;
  }
  return true;
}

export function privateEsicEligibleMerged(m: Record<string, unknown>, u?: Record<string, unknown> | null): boolean {
  if (isExplicitlyTrue(m.esic_eligible)) return true;
  if (isExplicitlyFalse(m.esic_eligible)) return false;
  if (u && isExplicitlyTrue(u.esic_eligible)) return true;
  return false;
}

export function statutoryIdPatchFromBody(body: Record<string, unknown>): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if (typeof body.uanNumber === "string") patch.uan_number = body.uanNumber.trim() || null;
  if (typeof body.pfNumber === "string") {
    const pf = body.pfNumber.trim() || null;
    patch.pf_number = pf;
    patch.cpf_number = pf;
  }
  if (typeof body.esicNumber === "string") patch.esic_number = body.esicNumber.trim() || null;
  return patch;
}
