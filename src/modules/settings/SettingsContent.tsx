"use client";

import { useHrmsSession } from "@/hooks/useHrmsSession";
import { type ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/common/ToastProvider";
import { SkeletonList, SkeletonTable, SkeletonText } from "@/components/common/Skeleton";
import { normalizePrivatePayrollConfig, type PrivatePayrollConfig } from "@/lib/payrollConfig";
import Image from "next/image";

export function SettingsContent() {
  const { role } = useHrmsSession();
  const { showToast } = useToast();
  const router = useRouter();
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const canManage = useMemo(() => role === "super_admin" || role === "admin" || role === "hr", [role]);
  const isSuperAdmin = role === "super_admin";
  const canViewCompanySettings = useMemo(
    () => role === "super_admin" || role === "admin" || role === "hr" || role === "manager",
    [role]
  );

  const [activeTab, setActiveTab] = useState<"company" | "shifts" | "roles" | "org" | "designations" | "payroll">(
    "company",
  );

  const [company, setCompany] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);

  const [creatingDoc, setCreatingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocKind, setNewDocKind] = useState<"upload" | "digital_signature">("upload");
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [newDocContent, setNewDocContent] = useState("");

  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [editDocName, setEditDocName] = useState("");
  const [editDocKind, setEditDocKind] = useState<"upload" | "digital_signature">("upload");
  const [editDocMandatory, setEditDocMandatory] = useState(true);
  const [editDocContent, setEditDocContent] = useState("");

  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    industry: "",
    industryOther: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    professionalTaxAnnual: "200",
    professionalTaxMonthly: "200",
  });

  // Settings modules
  const [isShiftsDialogOpen, setIsShiftsDialogOpen] = useState(false);
  const [isOrgDialogOpen, setIsOrgDialogOpen] = useState(false);
  const [isDesignationsDialogOpen, setIsDesignationsDialogOpen] = useState(false);
  const [isRolesDialogOpen, setIsRolesDialogOpen] = useState(false);
  const [orgDialogMode, setOrgDialogMode] = useState<"division" | "department">("division");

  const [shifts, setShifts] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleTabLoading, setModuleTabLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<null | { kind: "shifts" | "divisions" | "departments" | "designations" | "roles"; id: string; title: string }>(null);

  const [payrollCfgLoading, setPayrollCfgLoading] = useState(false);
  const [payrollCfgSaving, setPayrollCfgSaving] = useState(false);
  const [payrollCfgError, setPayrollCfgError] = useState<string | null>(null);
  const [payrollCfg, setPayrollCfg] = useState<PrivatePayrollConfig>(() => normalizePrivatePayrollConfig(null));

  const loadPayrollConfig = useCallback(async () => {
    if (!isSuperAdmin) return;
    setPayrollCfgLoading(true);
    setPayrollCfgError(null);
    try {
      const res = await fetch("/api/payroll/config");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to load payroll config");
      setPayrollCfg(normalizePrivatePayrollConfig((data as any)?.config));
    } catch (e: any) {
      setPayrollCfgError(e?.message || "Failed to load payroll config");
    } finally {
      setPayrollCfgLoading(false);
    }
  }, [isSuperAdmin]);

  async function savePayrollConfig(e: FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const sum =
      (payrollCfg.breakupPct.basicPct || 0) +
      (payrollCfg.breakupPct.hraPct || 0) +
      (payrollCfg.breakupPct.medicalPct || 0) +
      (payrollCfg.breakupPct.transPct || 0) +
      (payrollCfg.breakupPct.ltaPct || 0) +
      (payrollCfg.breakupPct.personalPct || 0);
    if (sum > 1.000001) {
      const msg = `Breakup total is ${Math.round(sum * 10000) / 100}%. It must be 100% or less.`;
      setPayrollCfgError(msg);
      showToast("error", msg);
      return;
    }
    setPayrollCfgSaving(true);
    setPayrollCfgError(null);
    try {
      const res = await fetch("/api/payroll/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payrollCfg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to save payroll config");
      setPayrollCfg(normalizePrivatePayrollConfig((data as any)?.config));
      showToast("success", "Payroll settings saved");
    } catch (e: any) {
      setPayrollCfgError(e?.message || "Failed to save payroll config");
      showToast("error", e?.message || "Failed to save payroll config");
    } finally {
      setPayrollCfgSaving(false);
    }
  }

  async function loadDocuments() {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to load documents");
      setDocs((data as any)?.documents || []);
    } catch (e: any) {
      setDocsError(e?.message || "Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  }

  function openDocsDialog() {
    setDocsDialogOpen(true);
    void loadDocuments();
  }

  async function createDocument(e: FormEvent) {
    e.preventDefault();
    setCreatingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newDocName.trim(),
          kind: newDocKind,
          isMandatory: Boolean(newDocMandatory),
          contentText: newDocKind === "digital_signature" ? newDocContent : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to create document");
      setNewDocName("");
      setNewDocKind("upload");
      setNewDocMandatory(true);
      setNewDocContent("");
      await loadDocuments();
      showToast("success", "Document added");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to create document");
      showToast("error", e?.message || "Failed to create document");
    } finally {
      setCreatingDoc(false);
    }
  }

  function startEditDoc(d: any) {
    setDocsError(null);
    setEditDocId(String(d.id));
    setEditDocName(String(d.name ?? ""));
    setEditDocKind((d.kind === "digital_signature" ? "digital_signature" : "upload") as any);
    setEditDocMandatory(Boolean(d.is_mandatory));
    setEditDocContent(String(d.content_text ?? ""));
  }

  function cancelEditDoc() {
    setEditDocId(null);
    setEditDocName("");
    setEditDocKind("upload");
    setEditDocMandatory(true);
    setEditDocContent("");
  }

  async function saveEditedDoc() {
    if (!editDocId) return;
    setSavingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDocId,
          name: editDocName.trim(),
          kind: editDocKind,
          isMandatory: Boolean(editDocMandatory),
          contentText: editDocKind === "digital_signature" ? editDocContent : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to update document");
      cancelEditDoc();
      await loadDocuments();
      showToast("success", "Document updated");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to update document");
      showToast("error", e?.message || "Failed to update document");
    } finally {
      setSavingDoc(false);
    }
  }

  async function deleteCompanyDoc(id: string) {
    setDeletingDoc(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/company/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to delete document");
      setDeleteDocId(null);
      if (editDocId === id) cancelEditDoc();
      await loadDocuments();
      showToast("success", "Document deleted");
    } catch (e: any) {
      setDocsError(e?.message || "Failed to delete document");
      showToast("error", e?.message || "Failed to delete document");
    } finally {
      setDeletingDoc(false);
    }
  }

  function formatTime12h(value: string): string {
    const raw = String(value || "");
    const parts = raw.split(":");
    const hh = Number(parts[0] ?? "0");
    const mm = parts[1] ?? "00";
    if (!Number.isFinite(hh)) return "";
    const suffix = hh >= 12 ? "PM" : "AM";
    const hour12 = ((hh + 11) % 12) + 1;
    return `${String(hour12).padStart(2, "0")}:${mm.padStart(2, "0")} ${suffix}`;
  }

  type TimePeriod = "AM" | "PM";
  type Time12 = { hour: number; minute: number; period: TimePeriod };

  function toTime12(value24: string): Time12 {
    const raw = String(value24 || "00:00").slice(0, 5);
    const [hStr, mStr] = raw.split(":");
    const hh = Number(hStr ?? "0");
    const mm = Number(mStr ?? "0");
    const period: TimePeriod = hh >= 12 ? "PM" : "AM";
    const hour = ((hh + 11) % 12) + 1;
    return { hour, minute: Number.isFinite(mm) ? mm : 0, period };
  }

  function to24h(t: Time12): string {
    let h = t.hour;
    if (t.period === "AM") {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return `${String(h).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  }

  function minutesSinceMidnight(t: Time12): number {
    const [hh, mm] = to24h(t).split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  }

  async function onLogoFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !isSuperAdmin) return;
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/company/logo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setCompany(data.company);
      showToast("success", "Company logo updated");
      router.refresh();
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeCompanyLogo() {
    if (!isSuperAdmin) return;
    if (!window.confirm("Remove the company logo from the sidebar?")) return;
    setLogoBusy(true);
    try {
      const res = await fetch("/api/company/logo", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to remove logo");
      setCompany(data.company);
      showToast("success", "Logo removed");
      router.refresh();
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  const [shiftForm, setShiftForm] = useState({
    id: "",
    name: "",
    start: { hour: 9, minute: 0, period: "AM" as TimePeriod },
    end: { hour: 6, minute: 0, period: "PM" as TimePeriod },
    isNightShift: false,
  });
  const [divisionForm, setDivisionForm] = useState({ id: "", name: "", description: "" });
  const [departmentForm, setDepartmentForm] = useState({ id: "", name: "", description: "", divisionId: "" });
  const [designationForm, setDesignationForm] = useState({ id: "", title: "", level: "" });
  const [roleForm, setRoleForm] = useState({ id: "", roleKey: "employee", name: "", description: "", isDefault: false });

  useEffect(() => {
    if (activeTab === "company") return;
    let cancelled = false;
    (async () => {
      setModuleTabLoading(true);
      setModuleError(null);
      try {
        if (activeTab === "shifts") await refreshShifts();
        if (activeTab === "roles") await refreshRoles();
        if (activeTab === "designations") await refreshDesignations();
        if (activeTab === "org") await refreshOrg();
      } catch (e: any) {
        if (!cancelled) setModuleError(e?.message || "Failed to load settings data");
      } finally {
        if (!cancelled) setModuleTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  async function refreshShifts() {
    const res = await fetch("/api/settings/shifts");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load shifts");
    setShifts(data.shifts || []);
  }

  async function refreshOrg() {
    const [divRes, depRes] = await Promise.all([fetch("/api/settings/divisions"), fetch("/api/settings/departments")]);
    const divData = await divRes.json();
    const depData = await depRes.json();
    if (!divRes.ok) throw new Error(divData?.error || "Failed to load divisions");
    if (!depRes.ok) throw new Error(depData?.error || "Failed to load departments");
    setDivisions(divData.divisions || []);
    setDepartments(depData.departments || []);
  }

  async function refreshDesignations() {
    const res = await fetch("/api/settings/designations");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load designations");
    setDesignations(data.designations || []);
  }

  async function refreshRoles() {
    const res = await fetch("/api/settings/roles");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load roles");
    setRoles(data.roles || []);
  }

  async function openShifts() {
    setModuleError(null);
    setShiftForm({
      id: "",
      name: "",
      start: { hour: 9, minute: 0, period: "AM" },
      end: { hour: 6, minute: 0, period: "PM" },
      isNightShift: false,
    });
    setIsShiftsDialogOpen(true);
    try {
      await refreshShifts();
    } catch (e: any) {
      setModuleError(e?.message || "Failed to load shifts");
    }
  }

  async function openOrg() {
    setModuleError(null);
    setDivisionForm({ id: "", name: "", description: "" });
    setDepartmentForm({ id: "", name: "", description: "", divisionId: "" });
    setIsOrgDialogOpen(true);
    try {
      await refreshOrg();
    } catch (e: any) {
      setModuleError(e?.message || "Failed to load organization");
    }
  }

  async function openDesignations() {
    setModuleError(null);
    setDesignationForm({ id: "", title: "", level: "" });
    setIsDesignationsDialogOpen(true);
    try {
      await refreshDesignations();
    } catch (e: any) {
      setModuleError(e?.message || "Failed to load designations");
    }
  }

  async function openRoles() {
    setModuleError(null);
    setRoleForm({ id: "", roleKey: "employee", name: "", description: "", isDefault: false });
    setIsRolesDialogOpen(true);
    try {
      await refreshRoles();
    } catch (e: any) {
      setModuleError(e?.message || "Failed to load roles");
    }
  }

  async function saveShift(e: FormEvent) {
    e.preventDefault();
    setModuleSaving(true);
    setModuleError(null);
    try {
      if (!shiftForm.name.trim()) throw new Error("Shift name is required");
      const startM = minutesSinceMidnight(shiftForm.start);
      const endM = minutesSinceMidnight(shiftForm.end);
      if (startM === endM) throw new Error("Start and end time cannot be the same");
      if (!shiftForm.isNightShift && endM <= startM) {
        throw new Error("End time must be after start time (enable Night shift for overnight shifts)");
      }
      if (shiftForm.isNightShift && endM > startM) {
        // Allow, but usually overnight means end is next day; still ok if they want a daytime night-shift toggle.
      }
      const start24 = to24h(shiftForm.start);
      const end24 = to24h(shiftForm.end);
      const res = await fetch("/api/settings/shifts", {
        method: shiftForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: shiftForm.id || undefined,
          name: shiftForm.name,
          isNightShift: shiftForm.isNightShift,
          startTime: start24,
          endTime: end24,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save shift");
      await refreshShifts();
      setShiftForm({
        id: "",
        name: "",
        start: { hour: 9, minute: 0, period: "AM" },
        end: { hour: 6, minute: 0, period: "PM" },
        isNightShift: false,
      });
      setIsShiftsDialogOpen(false);
      if (isSuperAdmin) showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to save shift");
      showToast("error", e?.message || "Failed to save shift");
    } finally {
      setModuleSaving(false);
    }
  }

  async function saveDivision(e: FormEvent) {
    e.preventDefault();
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch("/api/settings/divisions", {
        method: divisionForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(divisionForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save division");
      await refreshOrg();
      setDivisionForm({ id: "", name: "", description: "" });
      setIsOrgDialogOpen(false);
      if (isSuperAdmin) showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to save division");
      showToast("error", e?.message || "Failed to save division");
    } finally {
      setModuleSaving(false);
    }
  }

  async function saveDepartment(e: FormEvent) {
    e.preventDefault();
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch("/api/settings/departments", {
        method: departmentForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...departmentForm, divisionId: departmentForm.divisionId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save department");
      await refreshOrg();
      setDepartmentForm({ id: "", name: "", description: "", divisionId: "" });
      setIsOrgDialogOpen(false);
      if (isSuperAdmin) showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to save department");
      showToast("error", e?.message || "Failed to save department");
    } finally {
      setModuleSaving(false);
    }
  }

  async function saveDesignation(e: FormEvent) {
    e.preventDefault();
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch("/api/settings/designations", {
        method: designationForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...designationForm, level: designationForm.level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save designation");
      await refreshDesignations();
      setDesignationForm({ id: "", title: "", level: "" });
      setIsDesignationsDialogOpen(false);
      if (isSuperAdmin) showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to save designation");
      showToast("error", e?.message || "Failed to save designation");
    } finally {
      setModuleSaving(false);
    }
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault();
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch("/api/settings/roles", {
        method: roleForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roleForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save role");
      await refreshRoles();
      setRoleForm({ id: "", roleKey: "employee", name: "", description: "", isDefault: false });
      setIsRolesDialogOpen(false);
      if (isSuperAdmin) showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to save role");
      showToast("error", e?.message || "Failed to save role");
    } finally {
      setModuleSaving(false);
    }
  }

  async function toggleActive(kind: "shifts" | "divisions" | "departments" | "designations" | "roles", id: string, isActive: boolean) {
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch(`/api/settings/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update status");
      if (kind === "shifts") await refreshShifts();
      if (kind === "divisions" || kind === "departments") await refreshOrg();
      if (kind === "designations") await refreshDesignations();
      if (kind === "roles") await refreshRoles();
      showToast("success", "Updated successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to update status");
      showToast("error", e?.message || "Failed to update status");
    } finally {
      setModuleSaving(false);
    }
  }

  async function deleteItem(kind: "shifts" | "divisions" | "departments" | "designations" | "roles", id: string) {
    setConfirmState({ kind, id, title: "Delete permanently? This cannot be undone." });
  }

  async function confirmDelete() {
    if (!confirmState) return;
    const { kind, id } = confirmState;
    setModuleSaving(true);
    setModuleError(null);
    try {
      const res = await fetch(`/api/settings/${kind}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to delete");
      if (kind === "shifts") await refreshShifts();
      if (kind === "divisions" || kind === "departments") await refreshOrg();
      if (kind === "designations") await refreshDesignations();
      if (kind === "roles") await refreshRoles();
      showToast("success", "Deleted successfully");
    } catch (e: any) {
      setModuleError(e?.message || "Failed to delete");
      showToast("error", e?.message || "Failed to delete");
    } finally {
      setModuleSaving(false);
      setConfirmState(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/company/me");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load company profile");
        if (cancelled) return;
        setCompany(data.company);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load company profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (activeTab !== "payroll") return;
    void loadPayrollConfig();
  }, [activeTab, isSuperAdmin, loadPayrollConfig]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsCompanyDialogOpen(false);
    }
    if (isCompanyDialogOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCompanyDialogOpen]);

  function openCompanyDialog() {
    if (!isSuperAdmin) return;
    setFormError(null);
    const commonIndustries = [
      "IT / Software",
      "Manufacturing",
      "Retail",
      "Healthcare",
      "Education",
      "Finance",
      "Construction",
      "Logistics",
      "Hospitality",
      "Government",
    ];
    const existingIndustry = (company?.industry ?? "") as string;
    const isCommon = commonIndustries.includes(existingIndustry);
    setForm({
      name: company?.name ?? "",
      code: company?.code ?? "",
      industry: isCommon ? existingIndustry : existingIndustry ? "Other" : "",
      industryOther: isCommon ? "" : existingIndustry,
      phone: company?.phone ?? "",
      addressLine1: company?.address_line1 ?? "",
      addressLine2: company?.address_line2 ?? "",
      city: company?.city ?? "",
      state: company?.state ?? "",
      country: company?.country ?? "",
      postalCode: company?.postal_code ?? "",
      professionalTaxAnnual: String(company?.professional_tax_annual ?? 200),
      professionalTaxMonthly: String(company?.professional_tax_monthly ?? 200),
    });
    setIsCompanyDialogOpen(true);
  }

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        industry: form.industry === "Other" ? form.industryOther.trim() : form.industry,
        professionalTaxAnnual: form.professionalTaxAnnual ? parseFloat(form.professionalTaxAnnual) : 200,
        professionalTaxMonthly: form.professionalTaxMonthly ? parseFloat(form.professionalTaxMonthly) : 200,
      };
      const res = await fetch("/api/company/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save company profile");
      setCompany(data.company);
      setIsCompanyDialogOpen(false);
      showToast("success", "Settings updated successfully");
    } catch (e: any) {
      setFormError(e?.message || "Failed to save company profile");
      showToast("error", e?.message || "Failed to save company profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="muted">
          Company profile (name, address, professional tax, logo) can be changed by Super Admin only. Shifts, org structure,
          roles, and designations can be managed by Admin and HR.
        </p>
      </div>

      {canViewCompanySettings ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("company")}
              className={`btn ${activeTab === "company" ? "btn-primary" : "btn-outline"}`}
            >
              Company
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("shifts")}
              className={`btn ${activeTab === "shifts" ? "btn-primary" : "btn-outline"}`}
            >
              Shifts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("roles")}
              className={`btn ${activeTab === "roles" ? "btn-primary" : "btn-outline"}`}
            >
              Roles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("org")}
              className={`btn ${activeTab === "org" ? "btn-primary" : "btn-outline"}`}
            >
              Divisions & Departments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("designations")}
              className={`btn ${activeTab === "designations" ? "btn-primary" : "btn-outline"}`}
            >
              Designations
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("payroll")}
                className={`btn ${activeTab === "payroll" ? "btn-primary" : "btn-outline"}`}
              >
                Payroll
              </button>
            )}
          </div>

          {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}

          {activeTab === "company" && (
            <div className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Company profile</h2>
                  <p className="muted">Update company name, address, industry and contact details.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && (
                    <button type="button" className="btn btn-outline" onClick={openDocsDialog} disabled={loading}>
                      Company documents
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button type="button" className="btn btn-primary" onClick={openCompanyDialog} disabled={loading}>
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {loading ? (
                <div className="mt-4">
                  <SkeletonText lines={5} />
                </div>
              ) : error ? (
                <p className="mt-4 text-sm text-red-600">{error}</p>
              ) : (
                <div className="mt-4 text-sm text-slate-700">
                  <p>
                    <span className="text-slate-500">Name:</span> {company?.name || "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">Industry:</span> {company?.industry || "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">Phone:</span> {company?.phone || "—"}
                  </p>
                  <div className="mt-3">
                    <p className="text-slate-500">Address</p>
                    {(() => {
                      const a1 = typeof company?.address_line1 === "string" ? company.address_line1.trim() : "";
                      const a2 = typeof company?.address_line2 === "string" ? company.address_line2.trim() : "";
                      const city = typeof company?.city === "string" ? company.city.trim() : "";
                      const state = typeof company?.state === "string" ? company.state.trim() : "";
                      const pc = typeof company?.postal_code === "string" ? company.postal_code.trim() : "";
                      const country = typeof company?.country === "string" ? company.country.trim() : "";
                      const cityLine = [city, state].filter(Boolean).join(", ");
                      const cityPostal = [cityLine || null, pc || null].filter(Boolean).join(" ");
                      const hasAny = a1 || a2 || city || state || pc || country;
                      if (!hasAny) {
                        return <p className="mt-0.5 text-slate-700">—</p>;
                      }
                      return (
                        <div className="mt-0.5 space-y-0.5 text-slate-800">
                          {a1 ? <p>{a1}</p> : null}
                          {a2 ? <p>{a2}</p> : null}
                          {cityPostal ? <p>{cityPostal}</p> : null}
                          {country ? <p>{country}</p> : null}
                        </div>
                      );
                    })()}
                  </div>
                  <p className="mt-3">
                    <span className="text-slate-500">PT annual (₹):</span>{" "}
                    {company?.professional_tax_annual != null
                      ? Number(company.professional_tax_annual).toLocaleString("en-IN")
                      : "—"}
                  </p>
                  <p>
                    <span className="text-slate-500">PT monthly fixed (₹):</span>{" "}
                    {company?.professional_tax_monthly != null
                      ? Number(company.professional_tax_monthly).toLocaleString("en-IN")
                      : "—"}
                  </p>
                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">Company logo</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Appears at the top of the sidebar for everyone. Super Admin can upload or remove it (PNG, JPEG,
                      WebP, GIF, or SVG, max 2&nbsp;MB).
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {company?.logo_url ? (
                          <Image
                            unoptimized
                            src={String(company.logo_url)}
                            alt=""
                            width={160}
                            height={80}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">No logo</span>
                        )}
                      </div>
                      {isSuperAdmin && (
                        <div className="flex flex-col gap-2">
                          <input
                            ref={logoFileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            className="hidden"
                            onChange={onLogoFileSelected}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={logoBusy || loading}
                            onClick={() => logoFileRef.current?.click()}
                          >
                            {logoBusy ? "Working…" : "Upload logo"}
                          </button>
                          {company?.logo_url ? (
                            <button
                              type="button"
                              className="btn btn-outline text-red-700 hover:bg-red-50"
                              disabled={logoBusy || loading}
                              onClick={removeCompanyLogo}
                            >
                              Remove logo
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "payroll" && isSuperAdmin && (
            <div className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Payroll calculations (Private)</h2>
                  <p className="muted">
                    Configure PF/ESIC/PT and default salary breakup. These settings affect take-home previews and server calculations.
                  </p>
                </div>
              </div>

              {payrollCfgLoading ? (
                <div className="mt-4">
                  <SkeletonText lines={6} />
                </div>
              ) : (
                <form onSubmit={savePayrollConfig} className="mt-4 space-y-5">
                  {payrollCfgError ? <p className="text-sm text-red-600">{payrollCfgError}</p> : null}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="text-sm">
                      <span className="text-slate-600">PF rate (%)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={Math.round(payrollCfg.pfRate * 10000) / 100}
                        onChange={(e) =>
                          setPayrollCfg((p) => ({
                            ...p,
                            pfRate: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)),
                          }))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-slate-600">PF wage cap</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="1"
                        min="0"
                        value={payrollCfg.pfWageCap}
                        onChange={(e) => setPayrollCfg((p) => ({ ...p, pfWageCap: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-slate-600">PF cap (₹)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="1"
                        min="0"
                        value={payrollCfg.pfCap}
                        onChange={(e) => setPayrollCfg((p) => ({ ...p, pfCap: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-slate-600">PT default (₹)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="1"
                        min="0"
                        value={payrollCfg.ptMonthlyDefault}
                        onChange={(e) =>
                          setPayrollCfg((p) => ({ ...p, ptMonthlyDefault: Math.max(0, Number(e.target.value) || 0) }))
                        }
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="text-sm">
                      <span className="text-slate-600">ESIC ceiling (₹)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="1"
                        min="0"
                        value={payrollCfg.esicGrossCeilingInclusive}
                        onChange={(e) =>
                          setPayrollCfg((p) => ({
                            ...p,
                            esicGrossCeilingInclusive: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-slate-600">ESIC employee (%)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={Math.round(payrollCfg.esicEmployeeRate * 10000) / 100}
                        onChange={(e) =>
                          setPayrollCfg((p) => ({
                            ...p,
                            esicEmployeeRate: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)),
                          }))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-slate-600">ESIC employer (%)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={Math.round(payrollCfg.esicEmployerRate * 10000) / 100}
                        onChange={(e) =>
                          setPayrollCfg((p) => ({
                            ...p,
                            esicEmployerRate: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)),
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Default salary breakup (%)</h3>
                    <p className="mt-1 text-xs text-slate-500">Used when the employee doesn’t override component amounts.</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {(
                        [
                          ["basicPct", "Basic"],
                          ["hraPct", "HRA"],
                          ["medicalPct", "Medical"],
                          ["transPct", "Trans"],
                          ["ltaPct", "LTA"],
                          ["personalPct", "Personal"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="text-sm">
                          <span className="text-slate-600">{label} (%)</span>
                          <input
                            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={Math.round((payrollCfg.breakupPct[k] ?? 0) * 10000) / 100}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100));
                              setPayrollCfg((p) => ({ ...p, breakupPct: { ...p.breakupPct, [k]: v } }));
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="submit" className="btn btn-primary" disabled={payrollCfgSaving}>
                      {payrollCfgSaving ? "Saving…" : "Save payroll settings"}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setPayrollCfg(normalizePrivatePayrollConfig(null))} disabled={payrollCfgSaving}>
                      Reset to defaults
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === "shifts" && (
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Shifts</h2>
                  <p className="muted">Shifts available for this company.</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setModuleError(null);
                      setShiftForm({
                        id: "",
                        name: "",
                        start: { hour: 9, minute: 0, period: "AM" },
                        end: { hour: 6, minute: 0, period: "PM" },
                        isNightShift: false,
                      });
                      setIsShiftsDialogOpen(true);
                    }}
                  >
                    Add shift
                  </button>
                )}
              </div>
              {moduleTabLoading ? (
                <SkeletonTable rows={5} columns={6} />
              ) : shifts.length === 0 ? (
                <p className="muted">No shifts yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Night</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shifts.map((s) => (
                        <tr key={s.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2">{formatTime12h(String(s.start_time).slice(0, 5))}</td>
                          <td className="px-3 py-2">{formatTime12h(String(s.end_time).slice(0, 5))}</td>
                          <td className="px-3 py-2">{s.is_night_shift ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">{s.is_active === false ? "Inactive" : "Active"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {canManage && (
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => {
                                    setShiftForm({
                                      id: s.id,
                                      name: s.name,
                                      start: toTime12(String(s.start_time).slice(0, 5)),
                                      end: toTime12(String(s.end_time).slice(0, 5)),
                                      isNightShift: Boolean(s.is_night_shift),
                                    });
                                    setIsShiftsDialogOpen(true);
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                              {isSuperAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    disabled={moduleSaving}
                                    onClick={() => toggleActive("shifts", s.id, s.is_active === false)}
                                  >
                                    {s.is_active === false ? "Activate" : "Deactivate"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    disabled={moduleSaving}
                                    onClick={() => deleteItem("shifts", s.id)}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "roles" && (
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Roles</h2>
                  <p className="muted">Default roles (Super Admin/Admin/HR/Manager) cannot be deleted.</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setModuleError(null);
                      setRoleForm({ id: "", roleKey: "employee", name: "", description: "", isDefault: false });
                      setIsRolesDialogOpen(true);
                    }}
                  >
                    Add role
                  </button>
                )}
              </div>
              {moduleTabLoading ? (
                <SkeletonTable rows={5} columns={5} />
              ) : roles.length === 0 ? (
                <p className="muted">No roles yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Key</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Default</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((r) => {
                        const isProtected =
                          r.is_default || r.role_key === "super_admin" || r.role_key === "admin" || r.role_key === "hr" || r.role_key === "manager";
                        return (
                          <tr key={r.id} className="border-t border-slate-200">
                            <td className="px-3 py-2">{r.role_key}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.is_default ? "Yes" : "No"}</td>
                            <td className="px-3 py-2">{r.is_active === false ? "Inactive" : "Active"}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {canManage && (
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                      setRoleForm({
                                        id: r.id,
                                        roleKey: r.role_key,
                                        name: r.name,
                                        description: r.description ?? "",
                                        isDefault: Boolean(r.is_default),
                                      });
                                      setIsRolesDialogOpen(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                                {isSuperAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      disabled={moduleSaving || isProtected}
                                      onClick={() => toggleActive("roles", r.id, r.is_active === false)}
                                      title={isProtected ? "Default roles cannot be deactivated" : undefined}
                                    >
                                      {r.is_active === false ? "Activate" : "Deactivate"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      disabled={moduleSaving || isProtected}
                                      onClick={() => deleteItem("roles", r.id)}
                                      title={isProtected ? "Default roles cannot be deleted" : undefined}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "designations" && (
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Designations</h2>
                  <p className="muted">Titles available for this company.</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setModuleError(null);
                      setDesignationForm({ id: "", title: "", level: "" });
                      setIsDesignationsDialogOpen(true);
                    }}
                  >
                    Add designation
                  </button>
                )}
              </div>
              {moduleTabLoading ? (
                <SkeletonTable rows={5} columns={4} />
              ) : designations.length === 0 ? (
                <p className="muted">No designations yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Level</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {designations.map((d) => (
                        <tr key={d.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">{d.title}</td>
                          <td className="px-3 py-2">{d.level ?? "-"}</td>
                          <td className="px-3 py-2">{d.is_active === false ? "Inactive" : "Active"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {canManage && (
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => {
                                    setDesignationForm({ id: d.id, title: d.title, level: d.level ?? "" });
                                    setIsDesignationsDialogOpen(true);
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                              {isSuperAdmin && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    disabled={moduleSaving}
                                    onClick={() => toggleActive("designations", d.id, d.is_active === false)}
                                  >
                                    {d.is_active === false ? "Activate" : "Deactivate"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    disabled={moduleSaving}
                                    onClick={() => deleteItem("designations", d.id)}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "org" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="card space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="mb-1 text-lg font-semibold text-slate-900">Divisions</h2>
                    <p className="muted">Divisions for this company.</p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setModuleError(null);
                        setDivisionForm({ id: "", name: "", description: "" });
                        setOrgDialogMode("division");
                        setIsOrgDialogOpen(true);
                      }}
                    >
                      Add
                    </button>
                  )}
                </div>
                {moduleTabLoading ? (
                  <SkeletonList items={4} />
                ) : divisions.length === 0 ? (
                  <p className="muted">No divisions yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {divisions.map((d) => (
                      <li key={d.id} className="flex items-center justify-between border-t border-slate-200 pt-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{d.name}</p>
                          <p className="text-xs text-slate-500">{d.is_active === false ? "Inactive" : "Active"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManage && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                setDivisionForm({ id: d.id, name: d.name, description: d.description ?? "" });
                                setOrgDialogMode("division");
                                setIsOrgDialogOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {isSuperAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={moduleSaving}
                                onClick={() => toggleActive("divisions", d.id, d.is_active === false)}
                              >
                                {d.is_active === false ? "Activate" : "Deactivate"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={moduleSaving}
                                onClick={() => deleteItem("divisions", d.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="mb-1 text-lg font-semibold text-slate-900">Departments</h2>
                    <p className="muted">Departments for this company.</p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setModuleError(null);
                        setDepartmentForm({ id: "", name: "", description: "", divisionId: "" });
                        setOrgDialogMode("department");
                        setIsOrgDialogOpen(true);
                      }}
                    >
                      Add
                    </button>
                  )}
                </div>
                {moduleTabLoading ? (
                  <SkeletonList items={4} />
                ) : departments.length === 0 ? (
                  <p className="muted">No departments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {departments.map((d) => (
                      <li key={d.id} className="flex items-center justify-between border-t border-slate-200 pt-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{d.name}</p>
                          <p className="text-xs text-slate-500">
                            {d.division_id ? `Division: ${divisions.find((x) => x.id === d.division_id)?.name ?? "—"}` : "No division"} ·{" "}
                            {d.is_active === false ? "Inactive" : "Active"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManage && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                setDepartmentForm({ id: d.id, name: d.name, description: d.description ?? "", divisionId: d.division_id ?? "" });
                                setOrgDialogMode("department");
                                setIsOrgDialogOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {isSuperAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={moduleSaving}
                                onClick={() => toggleActive("departments", d.id, d.is_active === false)}
                              >
                                {d.is_active === false ? "Activate" : "Deactivate"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={moduleSaving}
                                onClick={() => deleteItem("departments", d.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Personal preferences</h2>
          <p className="muted">Employee preferences can be added here later.</p>
        </div>
      )}

      {isCompanyDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={() => setIsCompanyDialogOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Company profile</h2>
                <p className="text-sm text-slate-500">Update your company details.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsCompanyDialogOpen(false)}>
                Close
              </button>
            </div>

            <form onSubmit={saveCompany} className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Company name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Industry</label>
                  <select
                    value={form.industry}
                    onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value, industryOther: "" }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select</option>
                    <option value="IT / Software">IT / Software</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Retail">Retail</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Education">Education</option>
                    <option value="Finance">Finance</option>
                    <option value="Construction">Construction</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Hospitality">Hospitality</option>
                    <option value="Government">Government</option>
                    <option value="Other">Other</option>
                  </select>
                  {form.industry === "Other" && (
                    <input
                      type="text"
                      placeholder="Enter industry"
                      value={form.industryOther}
                      onChange={(e) => setForm((p) => ({ ...p, industryOther: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-3">
                  <h3 className="text-sm font-semibold text-slate-900">Address</h3>
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Address line 1</label>
                  <input
                    type="text"
                    value={form.addressLine1}
                    onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Address line 2</label>
                  <input
                    type="text"
                    value={form.addressLine2}
                    onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Postal code</label>
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    PT (annual ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.professionalTaxAnnual}
                    onChange={(e) => setForm((p) => ({ ...p, professionalTaxAnnual: e.target.value }))}
                    placeholder="200"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">For take-home calculation.</p>
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    PT (monthly ₹, fixed)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.professionalTaxMonthly}
                    onChange={(e) => setForm((p) => ({ ...p, professionalTaxMonthly: e.target.value }))}
                    placeholder="200"
                    title="Fixed deduction per month in payroll. Common: 200."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Fixed per month, not prorated.</p>
                </div>

                <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-2">
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-outline" onClick={() => setIsCompanyDialogOpen(false)} disabled={saving}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {docsDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={() => {
              setDocsDialogOpen(false);
              setDocsError(null);
              setDeleteDocId(null);
              cancelEditDoc();
            }}
          />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Company documents</h2>
                <p className="text-sm text-gray-600">Define onboarding documents (upload or digital signature).</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                onClick={() => {
                  setDocsDialogOpen(false);
                  setDocsError(null);
                  setDeleteDocId(null);
                  cancelEditDoc();
                }}
              >
                Close
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto p-5 space-y-4">
              {docsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{docsError}</div>
              )}

              <form onSubmit={createDocument} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
                <label className="text-sm sm:col-span-1">
                  <span className="text-gray-600">Document name</span>
                  <input
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Offer letter / ID proof / NDA"
                    required
                  />
                </label>
                <label className="text-sm sm:col-span-1">
                  <span className="text-gray-600">Type</span>
                  <select
                    value={newDocKind}
                    onChange={(e) => setNewDocKind(e.target.value as any)}
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="upload">Upload</option>
                    <option value="digital_signature">Digital signature</option>
                  </select>
                </label>
                <label className="text-sm sm:col-span-1 flex items-end gap-2">
                  <input type="checkbox" checked={newDocMandatory} onChange={(e) => setNewDocMandatory(e.target.checked)} />
                  <span className="text-gray-700 font-medium">Mandatory</span>
                </label>

                {newDocKind === "digital_signature" && (
                  <label className="text-sm sm:col-span-3">
                    <span className="text-gray-600">Signature content text</span>
                    <textarea
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                      rows={4}
                      className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Paste the agreement text employees must sign."
                    />
                  </label>
                )}

                <div className="sm:col-span-3 flex justify-start">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition disabled:opacity-50"
                    disabled={creatingDoc || !newDocName.trim()}
                  >
                    {creatingDoc ? "Adding…" : "Add document"}
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Existing documents</h3>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                    onClick={() => void loadDocuments()}
                    disabled={docsLoading}
                  >
                    {docsLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {docsLoading ? (
                  <p className="mt-3 text-sm text-gray-600">Loading…</p>
                ) : docs.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-600">No company documents configured yet.</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--primary-soft)]/40">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold text-gray-700">Name</th>
                          <th className="px-3 py-2 font-semibold text-gray-700">Type</th>
                          <th className="px-3 py-2 font-semibold text-gray-700">Mandatory</th>
                          <th className="px-3 py-2 font-semibold text-gray-700 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {docs.map((d: any) => (
                          <tr key={String(d.id)}>
                            <td className="px-3 py-2 font-medium text-gray-900">{String(d.name ?? "")}</td>
                            <td className="px-3 py-2 text-gray-700">{d.kind === "digital_signature" ? "Digital signature" : "Upload"}</td>
                            <td className="px-3 py-2 text-gray-700">{d.is_mandatory ? "Yes" : "No"}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                                  onClick={() => startEditDoc(d)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
                                  onClick={() => setDeleteDocId(String(d.id))}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {editDocId && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Edit document</h3>
                    <button
                      type="button"
                      className="text-sm font-semibold text-gray-700 hover:opacity-80 transition"
                      onClick={cancelEditDoc}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-sm sm:col-span-1">
                      <span className="text-gray-600">Document name</span>
                      <input
                        value={editDocName}
                        onChange={(e) => setEditDocName(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        required
                      />
                    </label>
                    <label className="text-sm sm:col-span-1">
                      <span className="text-gray-600">Type</span>
                      <select
                        value={editDocKind}
                        onChange={(e) => setEditDocKind(e.target.value as any)}
                        className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="upload">Upload</option>
                        <option value="digital_signature">Digital signature</option>
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-1 flex items-end gap-2">
                      <input type="checkbox" checked={editDocMandatory} onChange={(e) => setEditDocMandatory(e.target.checked)} />
                      <span className="text-gray-700 font-medium">Mandatory</span>
                    </label>
                    {editDocKind === "digital_signature" && (
                      <label className="text-sm sm:col-span-3">
                        <span className="text-gray-600">Signature content text</span>
                        <textarea
                          value={editDocContent}
                          onChange={(e) => setEditDocContent(e.target.value)}
                          rows={5}
                          className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                      onClick={cancelEditDoc}
                      disabled={savingDoc}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 transition disabled:opacity-50"
                      onClick={() => void saveEditedDoc()}
                      disabled={savingDoc || !editDocName.trim()}
                    >
                      {savingDoc ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {deleteDocId && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-amber-900">
                    Delete this document? This may fail if employees already have submissions linked to it.
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 transition disabled:opacity-50"
                      onClick={() => setDeleteDocId(null)}
                      disabled={deletingDoc}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                      onClick={() => void deleteCompanyDoc(deleteDocId)}
                      disabled={deletingDoc}
                    >
                      {deletingDoc ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close dialog"
            onClick={() => setConfirmState(null)}
          />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Confirm delete</h3>
              <p className="mt-1 text-sm text-slate-500">{confirmState.title}</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmState(null)} disabled={moduleSaving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmDelete} disabled={moduleSaving}>
                {moduleSaving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isShiftsDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsShiftsDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Shift management</h2>
                <p className="text-sm text-slate-500">Add and edit shifts for this company.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsShiftsDialogOpen(false)}>
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
              {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}
              <form onSubmit={saveShift} className="card grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Shift name</label>
                  <input
                    type="text"
                    required
                    value={shiftForm.name}
                    onChange={(e) => setShiftForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={shiftForm.start.hour}
                      onChange={(e) => setShiftForm((p) => ({ ...p, start: { ...p.start, hour: Number(e.target.value) } }))}
                      className="w-[76px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={shiftForm.start.minute}
                      onChange={(e) => setShiftForm((p) => ({ ...p, start: { ...p.start, minute: Number(e.target.value) } }))}
                      className="w-[76px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={shiftForm.start.period}
                      onChange={(e) => setShiftForm((p) => ({ ...p, start: { ...p.start, period: e.target.value as any } }))}
                      className="w-[92px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">End</label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={shiftForm.end.hour}
                      onChange={(e) => setShiftForm((p) => ({ ...p, end: { ...p.end, hour: Number(e.target.value) } }))}
                      className="w-[76px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={shiftForm.end.minute}
                      onChange={(e) => setShiftForm((p) => ({ ...p, end: { ...p.end, minute: Number(e.target.value) } }))}
                      className="w-[76px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={shiftForm.end.period}
                      onChange={(e) => setShiftForm((p) => ({ ...p, end: { ...p.end, period: e.target.value as any } }))}
                      className="w-[92px] rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={shiftForm.isNightShift}
                      onChange={(e) => setShiftForm((p) => ({ ...p, isNightShift: e.target.checked }))}
                    />
                    Night shift
                  </label>
                  <div className="flex gap-2">
                    {shiftForm.id && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() =>
                          setShiftForm({
                            id: "",
                            name: "",
                            start: { hour: 9, minute: 0, period: "AM" },
                            end: { hour: 6, minute: 0, period: "PM" },
                            isNightShift: false,
                          })
                        }
                        disabled={moduleSaving}
                      >
                        Cancel edit
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={moduleSaving}>
                      {moduleSaving ? "Saving..." : shiftForm.id ? "Update shift" : "Add shift"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isOrgDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsOrgDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Divisions & Departments</h2>
                <p className="text-sm text-slate-500">
                  {orgDialogMode === "division" ? "Add or edit a division." : "Add or edit a department."}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsOrgDialogOpen(false)}>
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
              {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}
              {orgDialogMode === "division" ? (
                <form onSubmit={saveDivision} className="card space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{divisionForm.id ? "Edit division" : "Add division"}</h3>
                    <button type="button" className="btn btn-outline" onClick={() => setIsOrgDialogOpen(false)} disabled={moduleSaving}>
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Division name"
                    required
                    value={divisionForm.name}
                    onChange={(e) => setDivisionForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={divisionForm.description}
                    onChange={(e) => setDivisionForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button type="submit" className="btn btn-primary" disabled={moduleSaving}>
                    {moduleSaving ? "Saving..." : divisionForm.id ? "Update" : "Add"}
                  </button>
                </form>
              ) : (
                <form onSubmit={saveDepartment} className="card space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{departmentForm.id ? "Edit department" : "Add department"}</h3>
                    <button type="button" className="btn btn-outline" onClick={() => setIsOrgDialogOpen(false)} disabled={moduleSaving}>
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Department name"
                    required
                    value={departmentForm.name}
                    onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <select
                    value={departmentForm.divisionId}
                    onChange={(e) => setDepartmentForm((p) => ({ ...p, divisionId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">No division</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={departmentForm.description}
                    onChange={(e) => setDepartmentForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button type="submit" className="btn btn-primary" disabled={moduleSaving}>
                    {moduleSaving ? "Saving..." : departmentForm.id ? "Update" : "Add"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {isDesignationsDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsDesignationsDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Designations</h2>
                <p className="text-sm text-slate-500">Add and edit designations for this company.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsDesignationsDialogOpen(false)}>
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
              {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}
              <form onSubmit={saveDesignation} className="card grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-3">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    type="text"
                    required
                    value={designationForm.title}
                    onChange={(e) => setDesignationForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Level</label>
                  <input
                    type="number"
                    value={designationForm.level}
                    onChange={(e) => setDesignationForm((p) => ({ ...p, level: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-4 flex justify-between">
                  <div />
                  <div className="flex gap-2">
                    {designationForm.id && (
                      <button type="button" className="btn btn-outline" onClick={() => setDesignationForm({ id: "", title: "", level: "" })}>
                        Cancel edit
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={moduleSaving}>
                      {moduleSaving ? "Saving..." : designationForm.id ? "Update" : "Add"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isRolesDialogOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsRolesDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Role management</h2>
                <p className="text-sm text-slate-500">Add and edit roles for this company.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsRolesDialogOpen(false)}>
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
              {moduleError && <p className="text-sm text-red-600">{moduleError}</p>}
              <form onSubmit={saveRole} className="card grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Role key</label>
                  <select
                    value={roleForm.roleKey}
                    disabled={Boolean(roleForm.id)}
                    onChange={(e) => setRoleForm((p) => ({ ...p, roleKey: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                  >
                    <option value="employee">employee</option>
                    <option value="manager">manager</option>
                    <option value="hr">hr</option>
                    <option value="admin">admin</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Display name</label>
                  <input
                    type="text"
                    required
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Default</label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 mt-2">
                    <input
                      type="checkbox"
                      checked={roleForm.isDefault}
                      onChange={(e) => setRoleForm((p) => ({ ...p, isDefault: e.target.checked }))}
                    />
                    Is default
                  </label>
                </div>
                <div className="md:col-span-4">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Description (optional)</label>
                  <input
                    type="text"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="md:col-span-4 flex justify-between">
                  <div />
                  <div className="flex gap-2">
                    {roleForm.id && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setRoleForm({ id: "", roleKey: "employee", name: "", description: "", isDefault: false })}
                      >
                        Cancel edit
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={moduleSaving}>
                      {moduleSaving ? "Saving..." : roleForm.id ? "Update" : "Add"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
