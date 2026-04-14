"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { RoleId } from "../../config/roleConfig";
import {
  normalizeDigits,
  normalizePanInput,
  validateEmailField,
  validateIndianMobileDigits,
  validateAadhaarDigits,
  validatePanNormalized
} from "../../lib/employeeValidators";
import {
  fetchCompanyDocuments,
  fetchCompanyMe,
  fetchDepartments,
  fetchDesignations,
  fetchDivisions,
  fetchShifts,
  createEmployee,
  updateEmployee,
  fetchEmployeeDetail
} from "./employeeDirectoryService";
import type { EmploymentStatusTab } from "./types";
import { computePayrollFromGross } from "@/lib/payrollCalc";
import type { PrivatePayrollConfig } from "@/lib/payrollConfig";

type Lookup = { id: string; title?: string; name?: string; division_id?: string };

export function EmployeeFormModal({
  open,
  mode,
  userId,
  onClose,
  onSaved,
  onToast
}: {
  open: boolean;
  mode: "add" | "edit";
  userId: string | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onToast: (kind: "success" | "error", msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [designations, setDesignations] = useState<Lookup[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [divisions, setDivisions] = useState<Lookup[]>([]);
  const [shifts, setShifts] = useState<Lookup[]>([]);
  const [companyDocs, setCompanyDocs] = useState<{ id: string; name: string; is_mandatory: boolean }[]>([]);
  const [requestedDocIds, setRequestedDocIds] = useState<string[]>([]);
  const [ptMonthly, setPtMonthly] = useState<number>(200);
  const [privatePayrollConfig, setPrivatePayrollConfig] = useState<PrivatePayrollConfig | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formRole, setFormRole] = useState<Exclude<RoleId, "super_admin">>("employee");
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatusTab>("preboarding");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female" | "other">("");
  const [designation, setDesignation] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [pfNumber, setPfNumber] = useState("");
  const [showGovernmentPayroll, setShowGovernmentPayroll] = useState(false);
  const [governmentPayLevel, setGovernmentPayLevel] = useState("");
  const [grossBasic, setGrossBasic] = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [pfEligible, setPfEligible] = useState(true);
  const [esicEligible, setEsicEligible] = useState(false);
  const [incomeTaxMonthly, setIncomeTaxMonthly] = useState("");
  const [password, setPassword] = useState("");
  const [currentAddressLine1, setCurrentAddressLine1] = useState("");
  const [currentAddressLine2, setCurrentAddressLine2] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [currentState, setCurrentState] = useState("");
  const [currentCountry, setCurrentCountry] = useState("");
  const [currentPostalCode, setCurrentPostalCode] = useState("");
  const [permanentAddressLine1, setPermanentAddressLine1] = useState("");
  const [permanentAddressLine2, setPermanentAddressLine2] = useState("");
  const [permanentCity, setPermanentCity] = useState("");
  const [permanentState, setPermanentState] = useState("");
  const [permanentCountry, setPermanentCountry] = useState("");
  const [permanentPostalCode, setPermanentPostalCode] = useState("");
  const [permanentSameAsCurrent, setPermanentSameAsCurrent] = useState(false);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  const departmentsInDivision = useMemo(() => {
    if (!divisionId) return departments;
    return departments.filter((d) => !d.division_id || d.division_id === divisionId);
  }, [departments, divisionId]);

  function reset() {
    setFormError(null);
    setName("");
    setEmail("");
    setFormRole("employee");
    setEmploymentStatus("preboarding");
    setPhone("");
    setGender("");
    setDesignation("");
    setDesignationId("");
    setDepartmentId("");
    setDivisionId("");
    setShiftId("");
    setAadhaar("");
    setPan("");
    setDateOfBirth("");
    setDateOfJoining("");
    setUanNumber("");
    setPfNumber("");
    setShowGovernmentPayroll(false);
    setGovernmentPayLevel("");
    setGrossBasic("");
    setGrossSalary("");
    setPfEligible(true);
    setEsicEligible(false);
    setIncomeTaxMonthly("");
    setPassword("");
    setCurrentAddressLine1("");
    setCurrentAddressLine2("");
    setCurrentCity("");
    setCurrentState("");
    setCurrentCountry("");
    setCurrentPostalCode("");
    setPermanentAddressLine1("");
    setPermanentAddressLine2("");
    setPermanentCity("");
    setPermanentState("");
    setPermanentCountry("");
    setPermanentPostalCode("");
    setPermanentSameAsCurrent(false);
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setBankName("");
    setBankAccountNumber("");
    setBankIfsc("");
    setRequestedDocIds([]);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [des, dep, div, sh, docsRes, companyRes, cfgRes] = await Promise.all([
          fetchDesignations(),
          fetchDepartments(),
          fetchDivisions(),
          fetchShifts(),
          mode === "add" ? fetchCompanyDocuments() : Promise.resolve({ documents: [] as { id: string; name: string; is_mandatory: boolean }[] }),
          fetchCompanyMe(),
          fetch("/api/payroll/config").catch(() => null as any),
        ]);
        if (cancelled) return;
        setDesignations((des.designations ?? []).filter((d) => d.is_active !== false).map((d) => ({ id: d.id, title: d.title })));
        setDepartments((dep.departments ?? []).filter((d) => d.is_active !== false).map((d) => ({ id: d.id, name: d.name, division_id: d.division_id })));
        setDivisions((div.divisions ?? []).filter((d) => d.is_active !== false).map((d) => ({ id: d.id, name: d.name })));
        setShifts((sh.shifts ?? []).filter((d) => d.is_active !== false).map((d) => ({ id: d.id, name: d.name })));
        const pt = companyRes?.company?.professional_tax_monthly;
        setPtMonthly(pt != null && Number.isFinite(Number(pt)) ? Math.max(0, Number(pt)) : 200);
        try {
          if (cfgRes && "ok" in cfgRes) {
            const cfgData = await (cfgRes as any).json();
            if (!cancelled && (cfgRes as any).ok) setPrivatePayrollConfig(cfgData?.config ?? null);
          }
        } catch {
          if (!cancelled) setPrivatePayrollConfig(null);
        }
        if (mode === "add") {
          const docs = docsRes.documents ?? [];
          setCompanyDocs(docs);
          setRequestedDocIds(docs.filter((d) => d.is_mandatory).map((d) => d.id));
        } else {
          setCompanyDocs([]);
        }
      } catch {
        if (!cancelled) onToast("error", "Failed to load form lookups");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, onToast]);

  useEffect(() => {
    if (!open || mode !== "edit" || !userId) return;
    let cancelled = false;
    (async () => {
      setPrefillLoading(true);
      try {
        const { employee: u } = await fetchEmployeeDetail(userId);
        if (cancelled) return;
        setName(String(u.name ?? ""));
        setEmail(String(u.email ?? ""));
        setFormRole((u.role === "super_admin" ? "employee" : u.role) as typeof formRole);
        setEmploymentStatus(u.employmentStatus);
        setPhone(String(u.phone ?? ""));
        setGender((u.gender as typeof gender) || "");
        setDateOfBirth(String(u.dateOfBirth ?? ""));
        setDateOfJoining(String(u.dateOfJoining ?? ""));
        setDesignation(String(u.designation ?? ""));
        setDesignationId(String(u.designationId ?? ""));
        setDepartmentId(String(u.departmentId ?? ""));
        setDivisionId(String(u.divisionId ?? ""));
        setShiftId(String(u.shiftId ?? ""));
        setAadhaar(String(u.aadhaar ?? ""));
        setPan(String(u.pan ?? ""));
        setUanNumber(String(u.uanNumber ?? ""));
        setPfNumber(String(u.pfNumber ?? u.cpfNumber ?? ""));
        setShowGovernmentPayroll(u.governmentPayLevel != null);
        setGovernmentPayLevel(u.governmentPayLevel != null ? String(u.governmentPayLevel) : "");
        setGrossBasic(u.grossBasic != null ? String(u.grossBasic) : "");
        setGrossSalary(u.grossSalary != null ? String(u.grossSalary) : "");
        setPfEligible(Boolean((u as any).pfEligible));
        setEsicEligible(Boolean((u as any).esicEligible));
        setIncomeTaxMonthly(String(u.incomeTaxMonthly ?? u.tds ?? ""));
        setCurrentAddressLine1(String(u.currentAddressLine1 ?? ""));
        setCurrentAddressLine2(String(u.currentAddressLine2 ?? ""));
        setCurrentCity(String(u.currentCity ?? ""));
        setCurrentState(String(u.currentState ?? ""));
        setCurrentCountry(String(u.currentCountry ?? ""));
        setCurrentPostalCode(String(u.currentPostalCode ?? ""));
        setPermanentAddressLine1(String(u.permanentAddressLine1 ?? ""));
        setPermanentAddressLine2(String(u.permanentAddressLine2 ?? ""));
        setPermanentCity(String(u.permanentCity ?? ""));
        setPermanentState(String(u.permanentState ?? ""));
        setPermanentCountry(String(u.permanentCountry ?? ""));
        setPermanentPostalCode(String(u.permanentPostalCode ?? ""));
        setEmergencyContactName(String(u.emergencyContactName ?? ""));
        setEmergencyContactPhone(String(u.emergencyContactPhone ?? ""));
        setBankName(String(u.bankName ?? ""));
        setBankAccountNumber(String(u.bankAccountNumber ?? ""));
        setBankIfsc(String(u.bankIfsc ?? ""));
      } catch (e) {
        if (!cancelled) setFormError(e instanceof Error ? e.message : "Failed to load employee");
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, userId]);

  useEffect(() => {
    if (open && mode === "add") reset();
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if (!permanentSameAsCurrent) return;
    setPermanentAddressLine1(currentAddressLine1);
    setPermanentAddressLine2(currentAddressLine2);
    setPermanentCity(currentCity);
    setPermanentState(currentState);
    setPermanentCountry(currentCountry);
    setPermanentPostalCode(currentPostalCode);
  }, [
    open,
    permanentSameAsCurrent,
    currentAddressLine1,
    currentAddressLine2,
    currentCity,
    currentState,
    currentCountry,
    currentPostalCode,
  ]);

  function pickDesignation(id: string) {
    setDesignationId(id);
    const t = designations.find((d) => d.id === id)?.title ?? "";
    setDesignation(t);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const eErr = validateEmailField(email.trim().toLowerCase());
    const phoneDigits = normalizeDigits(phone);
    const phErr = validateIndianMobileDigits(phoneDigits);
    const aDigits = normalizeDigits(aadhaar);
    const ahErr = validateAadhaarDigits(aDigits);
    const panNorm = normalizePanInput(pan);
    const pnErr = validatePanNormalized(panNorm);
    const pl = parseInt(governmentPayLevel.trim(), 10);
    const gbParsed = parseFloat(grossBasic.trim());
    const gsParsed = parseFloat(grossSalary.trim());
    const payLvErr =
      showGovernmentPayroll
        ? !governmentPayLevel.trim() || !Number.isFinite(pl) || pl < 1
          ? "Government pay level is required (≥ 1)"
          : null
        : null;
    const gbErr =
      showGovernmentPayroll
        ? !grossBasic.trim() || !Number.isFinite(gbParsed) || gbParsed <= 0
          ? "Monthly gross basic pay is required"
          : null
        : null;
    const gsErr =
      !showGovernmentPayroll
        ? !grossSalary.trim() || !Number.isFinite(gsParsed) || gsParsed <= 0
          ? "Monthly gross salary is required"
          : null
        : null;
    if (
      eErr ||
      phErr ||
      ahErr ||
      pnErr ||
      !name.trim() ||
      !designation.trim() ||
      !departmentId ||
      !divisionId ||
      !shiftId ||
      payLvErr ||
      gbErr ||
      gsErr
    ) {
      setFormError(
        eErr ||
          phErr ||
          ahErr ||
          pnErr ||
          payLvErr ||
          gbErr ||
          gsErr ||
          (!name.trim() ? "Name is required" : null) ||
          (!designation.trim() ? "Designation is required" : null) ||
          (!departmentId ? "Department is required" : null) ||
          (!divisionId ? "Division is required" : null) ||
          (!shiftId ? "Shift is required" : null) ||
          "Fix validation errors"
      );
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: formRole,
        employmentStatus,
        phone: phoneDigits,
        dateOfBirth: dateOfBirth || undefined,
        dateOfJoining: dateOfJoining || undefined,
        currentAddressLine1: currentAddressLine1.trim() || undefined,
        currentAddressLine2: currentAddressLine2.trim() || undefined,
        currentCity: currentCity.trim() || undefined,
        currentState: currentState.trim() || undefined,
        currentCountry: currentCountry.trim() || undefined,
        currentPostalCode: currentPostalCode.trim() || undefined,
        permanentAddressLine1: permanentAddressLine1.trim() || undefined,
        permanentAddressLine2: permanentAddressLine2.trim() || undefined,
        permanentCity: permanentCity.trim() || undefined,
        permanentState: permanentState.trim() || undefined,
        permanentCountry: permanentCountry.trim() || undefined,
        permanentPostalCode: permanentPostalCode.trim() || undefined,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankIfsc: bankIfsc.trim() || undefined,
        payrollMode: showGovernmentPayroll ? "government" : "private",
        ...(showGovernmentPayroll
          ? { grossBasic: gbParsed, governmentPayLevel: pl }
          : { grossSalary: gsParsed, pfEligible, esicEligible }),
        incomeTaxMonthly: incomeTaxMonthly.trim() ? parseFloat(incomeTaxMonthly.trim()) : undefined,
        gender: gender || undefined,
        designation: designation || undefined,
        designationId: designationId || undefined,
        departmentId: departmentId || undefined,
        divisionId: divisionId || undefined,
        shiftId: shiftId || undefined,
        aadhaar: aDigits,
        pan: panNorm,
        uanNumber: uanNumber || undefined,
        pfNumber: pfNumber.trim() || undefined,
        cpfNumber: pfNumber.trim() || undefined,
        password: mode === "add" ? password.trim() || undefined : undefined,
        requestedDocumentIds: mode === "add" && requestedDocIds.length ? requestedDocIds : undefined
      };

      if (mode === "add") {
        const data = await createEmployee(payload);
        if (data.inviteUrl) {
          try {
            await navigator.clipboard.writeText(String(data.inviteUrl));
            if (data.inviteEmailSent === true) {
              onSaved("Invite sent. Invite link copied (48h). Employee added.");
            } else if (data.inviteEmailSent === false) {
              onSaved(`Employee added. Invite email failed${data.inviteEmailError ? `: ${data.inviteEmailError}` : ""}. Link copied (48h).`);
            } else {
              onSaved("Employee added. Invite link copied (48h).");
            }
          } catch {
            if (data.inviteEmailSent === true) {
              onSaved("Invite sent. Employee added. Invite link returned by server.");
            } else if (data.inviteEmailSent === false) {
              onSaved(`Employee added. Invite email failed${data.inviteEmailError ? `: ${data.inviteEmailError}` : ""}. Invite link returned by server.`);
            } else {
              onSaved("Employee added. Invite link returned by server.");
            }
          }
        } else {
          onSaved("Employee added.");
        }
      } else if (userId) {
        await updateEmployee({ userId, ...payload });
        onSaved("Employee updated.");
      }
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";

  const privatePreview = useMemo(() => {
    if (showGovernmentPayroll) return null;
    const gross = Number(grossSalary);
    if (!Number.isFinite(gross) || gross <= 0) return null;
    const tds = Math.max(0, Number(incomeTaxMonthly) || 0);
    const calc = computePayrollFromGross(gross, pfEligible, esicEligible, ptMonthly, undefined, privatePayrollConfig ?? undefined);
    const takeHome = Math.max(0, Math.round(calc.takeHome - tds));
    return {
      gross: Math.round(gross),
      ptMonthly: Math.round(ptMonthly),
      tds,
      pfEmployee: Math.round(calc.pfEmp),
      esicEmployee: Math.round(calc.esicEmp),
      takeHome,
      ctc: Math.round(calc.ctc),
    };
  }, [showGovernmentPayroll, grossSalary, pfEligible, esicEligible, ptMonthly, incomeTaxMonthly, privatePayrollConfig]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-3xl max-h-[95vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900">{mode === "add" ? "Add employee" : "Edit employee"}</h2>
          <button type="button" className="text-gray-500 hover:text-gray-800 text-sm font-medium" onClick={onClose}>
            Close
          </button>
        </div>
        <form id="hrms-employee-form" onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {formError && (
            <div className="rounded-lg bg-red-50 text-red-800 text-sm px-3 py-2 border border-red-100">{formError}</div>
          )}
          {prefillLoading ? (
            <div className="text-sm text-gray-500">Loading employee…</div>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Identity</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="text-gray-600">Name</span>
                    <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Email</span>
                    <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "edit"} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Phone (10 digits)</span>
                    <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" required />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Role</span>
                    <select className={field} value={formRole} onChange={(e) => setFormRole(e.target.value as typeof formRole)}>
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="hr">HR</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Gender</span>
                    <select className={field} value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                      <option value="">—</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Date of birth</span>
                    <input className={field} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Aadhaar (12 digits)</span>
                    <input className={field} value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} inputMode="numeric" required />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">PAN</span>
                    <input className={field} value={pan} onChange={(e) => setPan(normalizePanInput(e.target.value))} required />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Employment</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Division</span>
                    <select className={field} value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setDepartmentId(""); }} required>
                      <option value="">Select</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Department</span>
                    <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
                      <option value="">Select</option>
                      {departmentsInDivision.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Designation</span>
                    <select className={field} value={designationId} onChange={(e) => pickDesignation(e.target.value)} required>
                      <option value="">Select</option>
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Shift</span>
                    <select className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
                      <option value="">Select</option>
                      {shifts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Date of joining</span>
                    <input className={field} type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} />
                  </label>
                  {mode === "edit" && (
                    <label className="text-sm">
                      <span className="text-gray-600">Employment status</span>
                      <select
                        className={field}
                        value={employmentStatus}
                        onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatusTab)}
                      >
                        <option value="preboarding">Preboarding</option>
                        <option value="current">Current</option>
                        <option value="past">Past</option>
                      </select>
                    </label>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Compensation</h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-gray-700 underline"
                    onClick={() => setShowGovernmentPayroll((v) => !v)}
                  >
                    {showGovernmentPayroll ? "Use private payroll" : "Use government payroll"}
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {!showGovernmentPayroll ? (
                    <>
                      <label className="text-sm">
                        <span className="text-gray-600">Monthly gross salary</span>
                        <input className={field} inputMode="decimal" value={grossSalary} onChange={(e) => setGrossSalary(e.target.value)} required />
                      </label>
                      <label className="text-sm">
                        <span className="text-gray-600">Income tax / month</span>
                        <input className={field} inputMode="decimal" value={incomeTaxMonthly} onChange={(e) => setIncomeTaxMonthly(e.target.value)} />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        <span className="text-gray-600">Statutory</span>
                        <div className="mt-1 flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={pfEligible} onChange={(e) => setPfEligible(e.target.checked)} />
                            PF eligible
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={esicEligible} onChange={(e) => setEsicEligible(e.target.checked)} />
                            ESIC eligible
                          </label>
                        </div>
                      </label>
                      {privatePreview && (
                        <div className="sm:col-span-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-gray-600">
                              Preview uses PT ₹{privatePreview.ptMonthly} + TDS ₹{Math.round(privatePreview.tds)}.
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              Take-home: ₹{privatePreview.takeHome.toLocaleString("en-IN")}
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-700">
                            <div className="rounded-md bg-white border border-gray-100 px-2 py-1">
                              <div className="text-[10px] uppercase text-gray-500">CTC</div>
                              <div className="font-semibold">₹{privatePreview.ctc.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="rounded-md bg-white border border-gray-100 px-2 py-1">
                              <div className="text-[10px] uppercase text-gray-500">PF (Emp)</div>
                              <div className="font-semibold">₹{privatePreview.pfEmployee.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="rounded-md bg-white border border-gray-100 px-2 py-1">
                              <div className="text-[10px] uppercase text-gray-500">ESIC (Emp)</div>
                              <div className="font-semibold">₹{privatePreview.esicEmployee.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="rounded-md bg-white border border-gray-100 px-2 py-1">
                              <div className="text-[10px] uppercase text-gray-500">TDS</div>
                              <div className="font-semibold">₹{Math.round(privatePreview.tds).toLocaleString("en-IN")}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                  <label className="text-sm">
                    <span className="text-gray-600">Pay level (≥ 1)</span>
                    <input className={field} inputMode="numeric" value={governmentPayLevel} onChange={(e) => setGovernmentPayLevel(e.target.value)} required />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Monthly gross basic</span>
                    <input className={field} inputMode="decimal" value={grossBasic} onChange={(e) => setGrossBasic(e.target.value)} required />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Income tax / month</span>
                    <input className={field} inputMode="decimal" value={incomeTaxMonthly} onChange={(e) => setIncomeTaxMonthly(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">UAN</span>
                    <input className={field} value={uanNumber} onChange={(e) => setUanNumber(e.target.value)} />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">PF / CPF number</span>
                    <input className={field} value={pfNumber} onChange={(e) => setPfNumber(e.target.value)} />
                  </label>
                    </>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bank</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Bank name</span>
                    <input className={field} value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Account number</span>
                    <input className={field} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">IFSC</span>
                    <input className={field} value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Addresses & emergency</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Current address line 1</span>
                    <input className={field} value={currentAddressLine1} onChange={(e) => setCurrentAddressLine1(e.target.value)} />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Current address line 2</span>
                    <input className={field} value={currentAddressLine2} onChange={(e) => setCurrentAddressLine2(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">City</span>
                    <input className={field} value={currentCity} onChange={(e) => setCurrentCity(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">State</span>
                    <input className={field} value={currentState} onChange={(e) => setCurrentState(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Country</span>
                    <input className={field} value={currentCountry} onChange={(e) => setCurrentCountry(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Postal code</span>
                    <input className={field} value={currentPostalCode} onChange={(e) => setCurrentPostalCode(e.target.value)} />
                  </label>

                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Permanent address</span>
                    <label className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={permanentSameAsCurrent}
                        onChange={(e) => setPermanentSameAsCurrent(e.target.checked)}
                      />
                      Same as Current Address
                    </label>
                  </label>

                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Permanent line 1</span>
                    <input
                      className={field}
                      value={permanentAddressLine1}
                      onChange={(e) => setPermanentAddressLine1(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Permanent line 2</span>
                    <input
                      className={field}
                      value={permanentAddressLine2}
                      onChange={(e) => setPermanentAddressLine2(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Permanent city</span>
                    <input
                      className={field}
                      value={permanentCity}
                      onChange={(e) => setPermanentCity(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Permanent state</span>
                    <input
                      className={field}
                      value={permanentState}
                      onChange={(e) => setPermanentState(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Permanent country</span>
                    <input
                      className={field}
                      value={permanentCountry}
                      onChange={(e) => setPermanentCountry(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Permanent postal code</span>
                    <input
                      className={field}
                      value={permanentPostalCode}
                      onChange={(e) => setPermanentPostalCode(e.target.value)}
                      disabled={permanentSameAsCurrent}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Emergency name</span>
                    <input className={field} value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600">Emergency phone</span>
                    <input className={field} value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
                  </label>
                </div>
              </section>

              {mode === "add" && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Onboarding documents (invite)</h3>
                  <p className="text-xs text-gray-500">Mandatory company documents are pre-selected; adjust which documents this invite requests.</p>
                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {companyDocs.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={requestedDocIds.includes(d.id)}
                          onChange={() =>
                            setRequestedDocIds((prev) =>
                              prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                            )
                          }
                        />
                        <span className="flex-1">{d.name}</span>
                        {d.is_mandatory && <span className="text-[10px] uppercase text-amber-700">Mandatory</span>}
                      </label>
                    ))}
                    {companyDocs.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No company documents configured.</div>}
                  </div>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-gray-600">Temporary password (optional)</span>
                    <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  </label>
                </section>
              )}
            </>
          )}
        </form>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="hrms-employee-form"
            disabled={loading || prefillLoading}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
