"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useHrmsSession } from "@/hooks/useHrmsSession";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/common/PaginationBar";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import { fmtDmy } from "@/lib/dateFormat";

function payrollHintFromClaimDate(claimDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) return null;
  const [y, m] = claimDate.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || m < 1 || m > 12) return null;
  const label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${label} ${y}`;
}

/** Prefer calendar month/year from claim_date so the table matches the expense date. */
function payrollPeriodLabel(claimDate: string | null | undefined, payrollYear: number | null | undefined, payrollMonth: number | null | undefined) {
  const raw = claimDate != null ? String(claimDate).slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map((x) => parseInt(x, 10));
    if (y && m >= 1 && m <= 12) {
      const label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
      return `${label} ${y}`;
    }
  }
  const m = payrollMonth ?? 1;
  const label = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${label} ${payrollYear ?? "—"}`;
}
import { useToast } from "@/components/common/ToastProvider";

export function ApprovalsContent() {
  const { role } = useHrmsSession();
  const { showToast } = useToast();
  const params = useSearchParams();
  const tab = params.get("tab") || "leave";

  const canApprove = useMemo(
    () => role === "super_admin" || role === "admin" || role === "hr",
    [role]
  );

  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [typeRows, setTypeRows] = useState<any[]>([]);
  const [requests, setRequests] = useState<
    {
      id: string;
      leaveTypeId: string;
      leaveTypeName: string;
      startDate: string;
      endDate: string;
      totalDays: any;
      reason: string | null;
      status: string;
      createdAt: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [currentEmployees, setCurrentEmployees] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<null | { id: string; reason: string }>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [balancePreview, setBalancePreview] = useState<{ paidDays: number; unpaidDays: number } | null>(null);

  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIsPaid, setNewTypeIsPaid] = useState(true);
  const [newAccrualMethod, setNewAccrualMethod] = useState<"monthly" | "annual" | "none">("monthly");
  const [newMonthlyRate, setNewMonthlyRate] = useState("1");
  const [newAnnualQuota, setNewAnnualQuota] = useState("12");
  const [newProrateOnJoin, setNewProrateOnJoin] = useState(true);
  const [newPayslipSlot, setNewPayslipSlot] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  const [editPolicyFor, setEditPolicyFor] = useState<null | { leaveTypeId: string; name: string }>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editPayslipSlot, setEditPayslipSlot] = useState("");
  const [editAccrualMethod, setEditAccrualMethod] = useState<"monthly" | "annual" | "none">("monthly");
  const [editMonthlyRate, setEditMonthlyRate] = useState("1");
  const [editAnnualQuota, setEditAnnualQuota] = useState("12");
  const [editProrateOnJoin, setEditProrateOnJoin] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [reimbClaims, setReimbClaims] = useState<any[]>([]);
  const [reimbLoading, setReimbLoading] = useState(false);
  const [reimbCat, setReimbCat] = useState("");
  const [reimbAmount, setReimbAmount] = useState("");
  const [reimbClaimDate, setReimbClaimDate] = useState("");
  const [reimbDesc, setReimbDesc] = useState("");
  const [reimbFile, setReimbFile] = useState<File | null>(null);
  const [reimbSubmitting, setReimbSubmitting] = useState(false);
  const [reimbActionId, setReimbActionId] = useState<string | null>(null);
  const [reimbRejectDialog, setReimbRejectDialog] = useState<null | { id: string; reason: string }>(null);
  const [reimbDialogOpen, setReimbDialogOpen] = useState(false);

  const listPageSize = useResponsivePageSize();
  const [leaveListPage, setLeaveListPage] = useState(1);
  const [reimbListPage, setReimbListPage] = useState(1);
  const [leaveRequestsTotal, setLeaveRequestsTotal] = useState(0);
  const [reimbClaimsTotal, setReimbClaimsTotal] = useState(0);

  function diffDaysInclusive(start: string, end: string): number {
    if (!start || !end) return 0;
    const s = new Date(start + "T00:00:00Z").getTime();
    const e = new Date(end + "T00:00:00Z").getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
  }

  const selectedLeaveType = typeRows.find((t: any) => t.id === leaveTypeId);
  const totalDays = diffDaysInclusive(startDate, endDate);
  const reimbPayrollHint = useMemo(() => payrollHintFromClaimDate(reimbClaimDate), [reimbClaimDate]);

  useEffect(() => {
    if (tab !== "leave") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(leaveListPage),
          pageSize: String(listPageSize),
        });
        const [typesRes, reqRes] = await Promise.all([
          fetch("/api/leave/types"),
          fetch(`/api/leave/requests?${params}`),
        ]);
        const typesData = await typesRes.json();
        const reqData = await reqRes.json();
        if (!typesRes.ok) throw new Error(typesData?.error || "Failed to load leave types");
        if (!reqRes.ok) throw new Error(reqData?.error || "Failed to load leave requests");
        if (cancelled) return;
        setTypeRows(typesData.types || []);
        setTypes((typesData.types || []).map((t: any) => ({ id: t.id, name: t.name })));
        setRequests(reqData.requests || []);
        setLeaveRequestsTotal(typeof reqData.total === "number" ? reqData.total : (reqData.requests?.length ?? 0));
        if (!leaveTypeId && (typesData.types || []).length) setLeaveTypeId(typesData.types[0].id);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load leave data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, leaveListPage, listPageSize]);

  useEffect(() => {
    if (tab !== "reimbursement") return;
    let cancelled = false;
    (async () => {
      setReimbLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(reimbListPage),
          pageSize: String(listPageSize),
        });
        const res = await fetch(`/api/reimbursements?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load reimbursement claims");
        if (cancelled) return;
        setReimbClaims(data.claims || []);
        setReimbClaimsTotal(typeof data.total === "number" ? data.total : (data.claims?.length ?? 0));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load reimbursements");
      } finally {
        if (!cancelled) setReimbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, reimbListPage, listPageSize]);

  useEffect(() => {
    if (!leaveDialogOpen || !canApprove) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/employees");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load employees");
        if (cancelled) return;
        const current = (data.employees || []).filter((e: any) => e.employmentStatus === "current");
        setCurrentEmployees(current.map((e: any) => ({ id: e.id, name: e.name, email: e.email })));
        if (!selectedEmployeeId && current.length) setSelectedEmployeeId(current[0].id);
      } catch {
        if (!cancelled) setCurrentEmployees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaveDialogOpen, canApprove, selectedEmployeeId]);

  useEffect(() => {
    if (!leaveDialogOpen || totalDays <= 0) {
      setBalancePreview(null);
      return;
    }
    if (canApprove && !selectedEmployeeId) {
      setBalancePreview(null);
      return;
    }
    const userId = canApprove ? selectedEmployeeId : undefined;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (leaveTypeId) params.set("leaveTypeId", leaveTypeId);
        if (startDate) params.set("asOf", startDate);
        if (userId) params.set("userId", userId);
        const res = await fetch(`/api/leave/balance?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const bal = Array.isArray(data.balances) ? data.balances[0] : null;
        if (!selectedLeaveType) {
          setBalancePreview(null);
          return;
        }
        if (selectedLeaveType.is_paid === false) {
          setBalancePreview({ paidDays: 0, unpaidDays: totalDays });
          return;
        }
        const remaining = bal?.remaining;
        const paid = remaining == null ? totalDays : Math.min(totalDays, Math.max(0, remaining));
        const unpaid = totalDays - paid;
        setBalancePreview({ paidDays: paid, unpaidDays: unpaid });
      } catch {
        if (!cancelled) setBalancePreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaveDialogOpen, totalDays, leaveTypeId, startDate, selectedEmployeeId, canApprove, selectedLeaveType]);

  useEffect(() => {
    setLeaveListPage(1);
    setReimbListPage(1);
  }, [tab]);

  useEffect(() => {
    setLeaveListPage(1);
    setReimbListPage(1);
  }, [listPageSize]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(leaveRequestsTotal / listPageSize));
    setLeaveListPage((p) => Math.min(p, tp));
  }, [leaveRequestsTotal, listPageSize]);

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(reimbClaimsTotal / listPageSize));
    setReimbListPage((p) => Math.min(p, tp));
  }, [reimbClaimsTotal, listPageSize]);

  async function refreshLeaveData() {
    const params = new URLSearchParams({
      page: String(leaveListPage),
      pageSize: String(listPageSize),
    });
    const [typesRes, reqRes] = await Promise.all([
      fetch("/api/leave/types"),
      fetch(`/api/leave/requests?${params}`),
    ]);
    const typesData = await typesRes.json();
    const reqData = await reqRes.json();
    if (!typesRes.ok) throw new Error(typesData?.error || "Failed to load leave types");
    if (!reqRes.ok) throw new Error(reqData?.error || "Failed to load leave requests");
    setTypeRows(typesData.types || []);
    setTypes((typesData.types || []).map((t: any) => ({ id: t.id, name: t.name })));
    setRequests(reqData.requests || []);
    setLeaveRequestsTotal(typeof reqData.total === "number" ? reqData.total : (reqData.requests?.length ?? 0));
  }

  async function submitLeave(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        leaveTypeId,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
        ...(canApprove ? { employeeUserId: selectedEmployeeId } : {}),
      }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit request");
      setLeaveListPage(1);
      const reqParams = new URLSearchParams({ page: "1", pageSize: String(listPageSize) });
      const reqRes = await fetch(`/api/leave/requests?${reqParams}`);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData?.error || "Failed to refresh requests");
      setRequests(reqData.requests || []);
      setLeaveRequestsTotal(typeof reqData.total === "number" ? reqData.total : (reqData.requests?.length ?? 0));
      setStartDate("");
      setEndDate("");
      setReason("");
      setLeaveDialogOpen(false);
      showToast("success", canApprove ? "Leave added" : "Request submitted");
    } catch (e: any) {
      setError(e?.message || "Failed to submit request");
      showToast("error", e?.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  async function createLeaveTypeWithPolicy(e: FormEvent) {
    e.preventDefault();
    setCreatingType(true);
    setError(null);
    try {
      const name = newTypeName.trim();
      if (!name) throw new Error("Leave type name is required");

      const typeRes = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          isPaid: Boolean(newTypeIsPaid),
          code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 16) || undefined,
          payslipSlot: newPayslipSlot || null,
        }),
      });
      const typeData = await typeRes.json();
      if (!typeRes.ok) throw new Error(typeData?.error || "Failed to create leave type");

      const leaveTypeId = typeData?.type?.id as string;
      if (!leaveTypeId) throw new Error("Leave type created but missing id");

      const policyRes = await fetch("/api/leave/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId,
          accrualMethod: newAccrualMethod,
          monthlyAccrualRate: newAccrualMethod === "monthly" ? Number(newMonthlyRate) : null,
          annualQuota: newAccrualMethod === "none" ? null : Number(newAnnualQuota),
          prorateOnJoin: Boolean(newProrateOnJoin),
          resetMonth: 1,
          resetDay: 1,
        }),
      });
      const policyData = await policyRes.json();
      if (!policyRes.ok) throw new Error(policyData?.error || "Failed to save leave policy");

      await refreshLeaveData();
      setNewTypeName("");
      setNewTypeIsPaid(true);
      setNewAccrualMethod("monthly");
      setNewMonthlyRate("1");
      setNewAnnualQuota("12");
      setNewProrateOnJoin(true);
      setNewPayslipSlot("");
      setManageTypesOpen(false);
      showToast("success", "Leave type created");
    } catch (e: any) {
      setError(e?.message || "Failed to create leave type");
      showToast("error", e?.message || "Failed to create leave type");
    } finally {
      setCreatingType(false);
    }
  }

  function openEditPolicy(t: any) {
    const p = Array.isArray(t.HRMS_leave_policies) ? t.HRMS_leave_policies[0] : t.HRMS_leave_policies;
    setEditPolicyFor({ leaveTypeId: t.id, name: t.name });
    setEditTypeName(String(t.name ?? ""));
    const ps = t.payslip_slot != null && String(t.payslip_slot).trim() ? String(t.payslip_slot).trim().toUpperCase() : "";
    setEditPayslipSlot(["CL", "EL", "HPL", "HL"].includes(ps) ? ps : "");
    setEditAccrualMethod((p?.accrual_method as any) || "monthly");
    setEditMonthlyRate(String(p?.monthly_accrual_rate ?? "1"));
    setEditAnnualQuota(String(p?.annual_quota ?? "12"));
    setEditProrateOnJoin(Boolean(p?.prorate_on_join ?? true));
  }

  async function savePolicy() {
    if (!editPolicyFor) return;
    setSavingPolicy(true);
    setError(null);
    try {
      const typeName = editTypeName.trim();
      if (!typeName) throw new Error("Display name is required");

      const typeRes = await fetch("/api/leave/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editPolicyFor.leaveTypeId,
          name: typeName,
          payslipSlot: editPayslipSlot || null,
        }),
      });
      const typeData = await typeRes.json();
      if (!typeRes.ok) throw new Error(typeData?.error || "Failed to update leave type");

      const res = await fetch("/api/leave/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId: editPolicyFor.leaveTypeId,
          accrualMethod: editAccrualMethod,
          monthlyAccrualRate: editAccrualMethod === "monthly" ? Number(editMonthlyRate) : null,
          annualQuota: editAccrualMethod === "none" ? null : Number(editAnnualQuota),
          prorateOnJoin: Boolean(editProrateOnJoin),
          resetMonth: 1,
          resetDay: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save policy");
      await refreshLeaveData();
      setEditPolicyFor(null);
      showToast("success", "Policy saved");
    } catch (e: any) {
      setError(e?.message || "Failed to save policy");
      showToast("error", e?.message || "Failed to save policy");
    } finally {
      setSavingPolicy(false);
    }
  }

  async function act(id: string, action: "approve" | "reject") {
    if (action === "reject") {
      setRejectDialog({ id, reason: "" });
      return;
    }
    setActionLoadingId(id);
    setError(null);
    try {
      const res = await fetch("/api/leave/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update request");
      const reqParams = new URLSearchParams({
        page: String(leaveListPage),
        pageSize: String(listPageSize),
      });
      const reqRes = await fetch(`/api/leave/requests?${reqParams}`);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData?.error || "Failed to refresh requests");
      setRequests(reqData.requests || []);
      setLeaveRequestsTotal(typeof reqData.total === "number" ? reqData.total : (reqData.requests?.length ?? 0));
      showToast("success", "Updated successfully");
    } catch (e: any) {
      setError(e?.message || "Failed to update request");
      showToast("error", e?.message || "Failed to update request");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function submitReject() {
    if (!rejectDialog) return;
    const { id, reason } = rejectDialog;
    setActionLoadingId(id);
    setError(null);
    try {
      const res = await fetch("/api/leave/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject", rejectionReason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to reject request");
      const reqParams = new URLSearchParams({
        page: String(leaveListPage),
        pageSize: String(listPageSize),
      });
      const reqRes = await fetch(`/api/leave/requests?${reqParams}`);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData?.error || "Failed to refresh requests");
      setRequests(reqData.requests || []);
      setLeaveRequestsTotal(typeof reqData.total === "number" ? reqData.total : (reqData.requests?.length ?? 0));
      setRejectDialog(null);
      showToast("success", "Rejected");
    } catch (e: any) {
      setError(e?.message || "Failed to reject request");
      showToast("error", e?.message || "Failed to reject request");
    } finally {
      setActionLoadingId(null);
    }
  }

  const REIMB_MAX_BYTES = 8 * 1024 * 1024;

  async function submitReimbursement(e: FormEvent) {
    e.preventDefault();
    setReimbSubmitting(true);
    setError(null);
    try {
      const cat = reimbCat.trim();
      const amt = parseFloat(reimbAmount);
      const desc = reimbDesc.trim();
      if (!cat) throw new Error("Category is required");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount greater than zero");
      if (!reimbClaimDate) throw new Error("Expense / claim date is required");
      if (!desc) throw new Error("Description is required");
      if (!reimbFile) throw new Error("Attachment is required (PDF or image, max 8 MB)");
      if (reimbFile.size <= 0) throw new Error("Choose a valid attachment file");
      if (reimbFile.size > REIMB_MAX_BYTES) throw new Error("Attachment must be 8 MB or smaller");

      const fd = new FormData();
      fd.append("file", reimbFile);
      const up = await fetch("/api/reimbursements/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData?.error || "Upload failed");
      const attachmentUrl = String(upData.url || "");
      if (!attachmentUrl) throw new Error("Upload did not return a file URL");

      const res = await fetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: cat,
          amount: amt,
          claimDate: reimbClaimDate,
          description: desc,
          attachmentUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit claim");
      setReimbListPage(1);
      const listParams = new URLSearchParams({ page: "1", pageSize: String(listPageSize) });
      const list = await fetch(`/api/reimbursements?${listParams}`);
      const listData = await list.json();
      if (!list.ok) throw new Error(listData?.error || "Failed to refresh");
      setReimbClaims(listData.claims || []);
      setReimbClaimsTotal(typeof listData.total === "number" ? listData.total : (listData.claims?.length ?? 0));
      setReimbCat("");
      setReimbAmount("");
      setReimbClaimDate("");
      setReimbDesc("");
      setReimbFile(null);
      setReimbDialogOpen(false);
      showToast("success", "Reimbursement claim submitted");
    } catch (err: any) {
      setError(err?.message || "Failed to submit");
      showToast("error", err?.message || "Failed to submit");
    } finally {
      setReimbSubmitting(false);
    }
  }

  async function actReimbursement(id: string, action: "approve" | "reject") {
    if (action === "reject") {
      setReimbRejectDialog({ id, reason: "" });
      return;
    }
    setReimbActionId(id);
    try {
      const res = await fetch(`/api/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to approve");
      const listParams = new URLSearchParams({
        page: String(reimbListPage),
        pageSize: String(listPageSize),
      });
      const list = await fetch(`/api/reimbursements?${listParams}`);
      const listData = await list.json();
      if (!list.ok) throw new Error(listData?.error || "Failed to refresh");
      setReimbClaims(listData.claims || []);
      setReimbClaimsTotal(typeof listData.total === "number" ? listData.total : (listData.claims?.length ?? 0));
      showToast("success", "Claim approved");
    } catch (err: any) {
      showToast("error", err?.message || "Failed");
    } finally {
      setReimbActionId(null);
    }
  }

  async function submitReimbReject() {
    if (!reimbRejectDialog) return;
    const { id, reason } = reimbRejectDialog;
    setReimbActionId(id);
    try {
      const res = await fetch(`/api/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to reject");
      const listParams = new URLSearchParams({
        page: String(reimbListPage),
        pageSize: String(listPageSize),
      });
      const list = await fetch(`/api/reimbursements?${listParams}`);
      const listData = await list.json();
      if (!list.ok) throw new Error(listData?.error || "Failed to refresh");
      setReimbClaims(listData.claims || []);
      setReimbClaimsTotal(typeof listData.total === "number" ? listData.total : (listData.claims?.length ?? 0));
      setReimbRejectDialog(null);
      showToast("success", "Claim rejected");
    } catch (err: any) {
      showToast("error", err?.message || "Failed");
    } finally {
      setReimbActionId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="page-title">Approvals</h1>
        <p className="muted">
          {role === "employee"
            ? "Submit leave and reimbursement requests."
            : "Review and approve requests for your team / company."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/approvals?tab=leave"
          className={`btn ${tab === "leave" ? "btn-primary" : "btn-outline"}`}
        >
          Leave
        </Link>
        <Link
          href="/app/approvals?tab=reimbursement"
          className={`btn ${tab === "reimbursement" ? "btn-primary" : "btn-outline"}`}
        >
          Reimbursement
        </Link>
      </div>

      {tab === "leave" && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">{canApprove ? "Add leave" : "Request leave"}</h2>
            <p className="muted">
              {canApprove
                ? "Add leave directly. Super Admin/Admin/HR entries are auto-approved."
                : "Submit a leave request. Super Admin/Admin/HR can approve/reject."}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => {
                  setError(null);
                  setSelectedEmployeeId("");
                  setLeaveDialogOpen(true);
                }}
              >
                {canApprove ? "Add leave" : "Request leave"}
              </button>
            </div>
          </div>

          {canApprove && (
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Leave types & policy (company-wise)</h2>
                  <p className="muted">
                    Configure accrual/quota rules per leave type. Balances reset every year on Jan 1.
                  </p>
                </div>
                <button type="button" className="btn btn-outline" onClick={() => setManageTypesOpen(true)}>
                  Add leave type
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Payslip</th>
                      <th className="px-3 py-2">Paid</th>
                      <th className="px-3 py-2">Accrual</th>
                      <th className="px-3 py-2">Monthly</th>
                      <th className="px-3 py-2">Annual quota</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map((t: any) => {
                      const p = Array.isArray(t.HRMS_leave_policies) ? t.HRMS_leave_policies[0] : t.HRMS_leave_policies;
                      return (
                        <tr key={t.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">{t.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {t.payslip_slot ? String(t.payslip_slot) : "—"}
                          </td>
                          <td className="px-3 py-2">{t.is_paid ? "Yes" : "No"}</td>
                          <td className="px-3 py-2">{p?.accrual_method ?? "-"}</td>
                          <td className="px-3 py-2">{p?.monthly_accrual_rate ?? "-"}</td>
                          <td className="px-3 py-2">{p?.annual_quota ?? "-"}</td>
                          <td className="px-3 py-2">
                            <button type="button" className="btn btn-outline" onClick={() => openEditPolicy(t)}>
                              Edit policy
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Leave requests</h2>
            {loading ? (
              <p className="muted">Loading...</p>
            ) : leaveRequestsTotal === 0 ? (
              <p className="muted">No leave requests yet.</p>
            ) : (
              (() => {
                const hasPendingActions = canApprove && requests.some((r: any) => r?.status === "pending");
                return (
                  <>
                {leaveRequestsTotal > listPageSize && (
                  <div className="mb-4 md:hidden">
                    <PaginationBar
                      page={leaveListPage}
                      total={leaveRequestsTotal}
                      pageSize={listPageSize}
                      onPageChange={setLeaveListPage}
                    />
                  </div>
                )}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Dates</th>
                        <th className="px-3 py-2">Days</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Reason</th>
                        {hasPendingActions && <th className="px-3 py-2">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id} className="border-t border-slate-200">
                          <td className="px-3 py-2">{r.leaveTypeName || "-"}</td>
                          <td className="px-3 py-2">
                            {fmtDmy(r.startDate)} → {fmtDmy(r.endDate)}
                          </td>
                          <td className="px-3 py-2">{r.totalDays}</td>
                          <td className="px-3 py-2">{r.status}</td>
                          <td className="px-3 py-2">{r.reason || "-"}</td>
                          {hasPendingActions && r.status === "pending" && (
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                disabled={actionLoadingId === r.id}
                                  onClick={() => act(r.id, "approve")}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                disabled={actionLoadingId === r.id}
                                  onClick={() => act(r.id, "reject")}
                                >
                                  Reject
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 md:hidden">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="font-semibold text-slate-900">{r.leaveTypeName || "—"}</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {fmtDmy(r.startDate)} → {fmtDmy(r.endDate)} · {r.totalDays} day(s)
                      </p>
                      <p className="mt-2 text-sm capitalize text-slate-600">Status: {r.status}</p>
                      {r.reason && r.reason !== "-" && <p className="mt-2 text-sm text-slate-600">Reason: {r.reason}</p>}
                      {hasPendingActions && r.status === "pending" && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            className="btn btn-primary text-sm"
                            disabled={actionLoadingId === r.id}
                            onClick={() => act(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline text-sm"
                            disabled={actionLoadingId === r.id}
                            onClick={() => act(r.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {leaveRequestsTotal > listPageSize && (
                  <div className="mt-4 hidden border-t border-slate-200 pt-4 md:block">
                    <PaginationBar
                      page={leaveListPage}
                      total={leaveRequestsTotal}
                      pageSize={listPageSize}
                      onPageChange={setLeaveListPage}
                    />
                  </div>
                )}
                  </>
                );
              })()
            )}
          </div>

          {rejectDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setRejectDialog(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Reject leave request</h3>
                  <p className="mt-1 text-sm text-slate-500">Add a reason (optional) and confirm.</p>
                </div>
                <div className="p-5 space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Reason</label>
                  <input
                    type="text"
                    value={rejectDialog.reason}
                    onChange={(e) => setRejectDialog((p) => (p ? { ...p, reason: e.target.value } : p))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" className="btn btn-outline" onClick={() => setRejectDialog(null)} disabled={actionLoadingId === rejectDialog.id}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={submitReject} disabled={actionLoadingId === rejectDialog.id}>
                      {actionLoadingId === rejectDialog.id ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {leaveDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setLeaveDialogOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">{canApprove ? "Add leave" : "Request leave"}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {canApprove ? "Fill in the details to add leave." : "Fill in the details to submit a leave request."}
                  </p>
                </div>

                <form onSubmit={submitLeave} className="p-5">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                      {canApprove && (
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Employee</label>
                          <select
                            required={canApprove}
                            value={selectedEmployeeId}
                            onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">Select employee</option>
                            {currentEmployees.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name || e.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                        <select
                          value={leaveTypeId}
                          onChange={(e) => setLeaveTypeId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {types.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Reason (optional)</label>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
                        <DatePickerField value={startDate} onChange={setStartDate} required className="w-full" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">End date</label>
                        <DatePickerField value={endDate} onChange={setEndDate} min={startDate || undefined} required className="w-full" />
                      </div>
                    </div>
                    {totalDays > 0 && (
                      <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-700">
                        <span className="font-medium">Total: {totalDays} day{totalDays !== 1 ? "s" : ""}</span>
                        {balancePreview ? (
                          <>
                            {balancePreview.paidDays > 0 && <span className="ml-2 text-emerald-700">{Math.round(balancePreview.paidDays)} paid</span>}
                            {balancePreview.unpaidDays > 0 && <span className="ml-2 text-amber-700">{Math.round(balancePreview.unpaidDays)} unpaid</span>}
                          </>
                        ) : selectedLeaveType?.is_paid === false ? (
                          <span className="ml-2 text-amber-700">{totalDays} unpaid</span>
                        ) : (
                          <span className="ml-2 text-slate-500">Calculating...</span>
                        )}
                      </div>
                    )}

                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => setLeaveDialogOpen(false)} disabled={submitting || loading}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting || loading || (canApprove && currentEmployees.length === 0)}
                      >
                        {submitting ? (canApprove ? "Adding..." : "Submitting...") : canApprove ? "Add leave" : "Submit request"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {manageTypesOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={() => setManageTypesOpen(false)} />
              <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Add leave type</h3>
                  <p className="mt-1 text-sm text-slate-500">Create a leave type and set company-wise accrual rules.</p>
                </div>

                <form onSubmit={createLeaveTypeWithPolicy} className="p-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Paid Leave"
                        required
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={newTypeIsPaid} onChange={(e) => setNewTypeIsPaid(e.target.checked)} />
                        Paid (affects payroll)
                      </label>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Payslip line (government slip)</label>
                      <select
                        value={newPayslipSlot}
                        onChange={(e) => setNewPayslipSlot(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Not shown</option>
                        <option value="CL">CL — Casual leave</option>
                        <option value="EL">EL — Earned leave</option>
                        <option value="HPL">HPL — Half pay leave</option>
                        <option value="HL">HL — Half leave</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Accrual method</label>
                      <select
                        value={newAccrualMethod}
                        onChange={(e) => setNewAccrualMethod(e.target.value as any)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="monthly">Monthly (e.g. 1/month)</option>
                        <option value="annual">Annual quota (e.g. 3/year)</option>
                        <option value="none">No limit</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Prorate on join</label>
                      <select
                        value={newProrateOnJoin ? "yes" : "no"}
                        onChange={(e) => setNewProrateOnJoin(e.target.value === "yes")}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>

                    {newAccrualMethod === "monthly" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Monthly accrual rate</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={newMonthlyRate}
                          onChange={(e) => setNewMonthlyRate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    {newAccrualMethod !== "none" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Annual quota</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={newAnnualQuota}
                          onChange={(e) => setNewAnnualQuota(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => setManageTypesOpen(false)} disabled={creatingType}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={creatingType}>
                        {creatingType ? "Creating..." : "Create"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {editPolicyFor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={() => setEditPolicyFor(null)} />
              <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Edit policy</h3>
                  <p className="mt-1 text-sm text-slate-500">{editPolicyFor.name}</p>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Display name</label>
                      <input
                        type="text"
                        value={editTypeName}
                        onChange={(e) => setEditTypeName(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Payslip line (government slip)</label>
                      <select
                        value={editPayslipSlot}
                        onChange={(e) => setEditPayslipSlot(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Not shown</option>
                        <option value="CL">CL — Casual leave</option>
                        <option value="EL">EL — Earned leave</option>
                        <option value="HPL">HPL — Half pay leave</option>
                        <option value="HL">HL — Half leave</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Accrual method</label>
                      <select
                        value={editAccrualMethod}
                        onChange={(e) => setEditAccrualMethod(e.target.value as any)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                        <option value="none">No limit</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Prorate on join</label>
                      <select
                        value={editProrateOnJoin ? "yes" : "no"}
                        onChange={(e) => setEditProrateOnJoin(e.target.value === "yes")}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>

                    {editAccrualMethod === "monthly" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Monthly accrual rate</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={editMonthlyRate}
                          onChange={(e) => setEditMonthlyRate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    {editAccrualMethod !== "none" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Annual quota</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={editAnnualQuota}
                          onChange={(e) => setEditAnnualQuota(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-outline" onClick={() => setEditPolicyFor(null)} disabled={savingPolicy}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary" onClick={savePolicy} disabled={savingPolicy}>
                        {savingPolicy ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "reimbursement" && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Request reimbursement</h2>
            <p className="muted">
              Submit an expense claim with category, amount, date, description, and proof attachment (max 8 MB). Payroll
              period follows your expense date. Super Admin, Admin, or HR must approve before it is paid in payroll.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {error && tab === "reimbursement" && !reimbDialogOpen && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                className="btn btn-primary"
                disabled={reimbLoading}
                onClick={() => {
                  setError(null);
                  setReimbDialogOpen(true);
                }}
              >
                Request reimbursement
              </button>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Claims</h2>
            {reimbLoading ? (
              <p className="muted">Loading…</p>
            ) : reimbClaimsTotal === 0 ? (
              <p className="muted">No reimbursement claims yet.</p>
            ) : (
              <>
                {reimbClaimsTotal > listPageSize && (
                  <div className="mb-4 md:hidden">
                    <PaginationBar
                      page={reimbListPage}
                      total={reimbClaimsTotal}
                      pageSize={listPageSize}
                      onPageChange={setReimbListPage}
                    />
                  </div>
                )}
                <div className="mt-3 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-2 py-2">Employee</th>
                        <th className="px-2 py-2">Category</th>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Claim date</th>
                        <th className="px-2 py-2">Payroll period</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Approved by</th>
                        <th className="px-2 py-2">Attachment</th>
                        {canApprove && <th className="px-2 py-2">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {reimbClaims.map((c: any) => (
                        <tr key={c.id} className="border-t border-slate-200">
                          <td className="px-2 py-2">
                            <div>{c.employeeName || "—"}</div>
                            <div className="text-xs text-slate-500">{c.employeeEmail || ""}</div>
                          </td>
                          <td className="px-2 py-2">{c.category}</td>
                          <td className="px-2 py-2">₹{Number(c.amount ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-2 py-2">{c.claim_date}</td>
                          <td className="px-2 py-2">
                            {payrollPeriodLabel(c.claim_date, c.payroll_year, c.payroll_month)}
                          </td>
                          <td className="px-2 py-2 capitalize">
                            {c.status === "paid" ? "Paid (payroll)" : c.status}
                          </td>
                          <td className="px-2 py-2">
                            {c.status === "approved" || c.status === "rejected" || c.status === "paid" ? (
                              <div>
                                <div>{c.approverName || "—"}</div>
                                {c.status === "paid" && c.paid_at ? (
                                  <div className="text-xs text-slate-500">{`Paid ${new Date(c.paid_at).toLocaleString()}`}</div>
                                ) : c.status === "approved" && c.approved_at ? (
                                  <div className="text-xs text-slate-500">{`Approved ${new Date(c.approved_at).toLocaleString()}`}</div>
                                ) : c.status === "rejected" && c.rejected_at ? (
                                  <div className="text-xs text-slate-500">{`Rejected ${new Date(c.rejected_at).toLocaleString()}`}</div>
                                ) : null}
                                {c.status === "rejected" && c.rejection_reason && (
                                  <div className="text-xs text-red-600">{c.rejection_reason}</div>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {c.attachment_url ? (
                              <a
                                href={c.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 underline"
                              >
                                View
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          {canApprove && (
                            <td className="px-2 py-2">
                              {c.status === "pending" ? (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-primary text-xs"
                                    disabled={reimbActionId === c.id}
                                    onClick={() => actReimbursement(c.id, "approve")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline text-xs"
                                    disabled={reimbActionId === c.id}
                                    onClick={() => actReimbursement(c.id, "reject")}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-3 md:hidden">
                  {reimbClaims.map((c: any) => (
                    <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="font-semibold text-slate-900">{c.employeeName || "—"}</p>
                      <p className="text-xs text-slate-500 break-all">{c.employeeEmail || ""}</p>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Category</dt>
                          <dd>{c.category}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Amount</dt>
                          <dd className="tabular-nums font-medium">₹{Number(c.amount ?? 0).toLocaleString("en-IN")}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Claim date</dt>
                          <dd>{c.claim_date}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Payroll period</dt>
                          <dd>{payrollPeriodLabel(c.claim_date, c.payroll_year, c.payroll_month)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Status</dt>
                          <dd className="capitalize">{c.status === "paid" ? "Paid (payroll)" : c.status}</dd>
                        </div>
                      </dl>
                      {c.status === "approved" || c.status === "rejected" || c.status === "paid" ? (
                        <div className="mt-3 text-sm text-slate-700">
                          <span className="text-slate-500">Approver: </span>
                          {c.approverName || "—"}
                          {c.status === "paid" && c.paid_at && (
                            <span className="mt-1 block text-xs text-slate-500">{`Paid ${new Date(c.paid_at).toLocaleString()}`}</span>
                          )}
                          {c.status === "approved" && c.approved_at && (
                            <span className="mt-1 block text-xs text-slate-500">{`Approved ${new Date(c.approved_at).toLocaleString()}`}</span>
                          )}
                          {c.status === "rejected" && c.rejected_at && (
                            <span className="mt-1 block text-xs text-slate-500">{`Rejected ${new Date(c.rejected_at).toLocaleString()}`}</span>
                          )}
                          {c.status === "rejected" && c.rejection_reason && (
                            <span className="mt-1 block text-xs text-red-600">{c.rejection_reason}</span>
                          )}
                        </div>
                      ) : null}
                      <div className="mt-3">
                        {c.attachment_url ? (
                          <a
                            href={c.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-emerald-700 underline"
                          >
                            View attachment
                          </a>
                        ) : (
                          <span className="text-sm text-slate-400">No attachment</span>
                        )}
                      </div>
                      {canApprove && c.status === "pending" && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            className="btn btn-primary text-sm"
                            disabled={reimbActionId === c.id}
                            onClick={() => actReimbursement(c.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline text-sm"
                            disabled={reimbActionId === c.id}
                            onClick={() => actReimbursement(c.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {reimbClaimsTotal > listPageSize && (
                  <div className="mt-4 hidden border-t border-slate-200 pt-4 md:block">
                    <PaginationBar
                      page={reimbListPage}
                      total={reimbClaimsTotal}
                      pageSize={listPageSize}
                      onPageChange={setReimbListPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {reimbDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setReimbDialogOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Request reimbursement</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    All fields are required, including a proof attachment (max 8 MB). Payroll period is set from the
                    expense date.
                  </p>
                </div>
                <form noValidate onSubmit={submitReimbursement} className="p-5">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Category <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          value={reimbCat}
                          onChange={(e) => setReimbCat(e.target.value)}
                          placeholder="e.g. Travel, Medical, Meals"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Amount (INR) <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          type="number"
                          min={0}
                          step="0.01"
                          value={reimbAmount}
                          onChange={(e) => setReimbAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Expense / claim date <span className="text-red-500">*</span>
                        </label>
                        <DatePickerField value={reimbClaimDate} onChange={setReimbClaimDate} required className="w-full" />
                        {reimbPayrollHint && (
                          <p className="mt-1.5 text-xs text-slate-600">
                            Included in the <span className="font-medium text-slate-800">{reimbPayrollHint}</span> payroll
                            when approved (based on this date).
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          required
                          value={reimbDesc}
                          onChange={(e) => setReimbDesc(e.target.value)}
                          rows={3}
                          placeholder="Briefly describe the expense"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Attachment <span className="text-red-500">*</span>{" "}
                          <span className="font-normal text-slate-500">(PDF or image, max 8 MB)</span>
                        </label>
                        <input
                          type="file"
                          required
                          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                          onChange={(e) => setReimbFile(e.target.files?.[0] ?? null)}
                          className="w-full text-sm text-slate-600 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setReimbDialogOpen(false)}
                        disabled={reimbSubmitting}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={reimbSubmitting}>
                        {reimbSubmitting ? "Submitting…" : "Submit claim"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {reimbRejectDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close dialog"
                onClick={() => setReimbRejectDialog(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-900">Reject reimbursement</h3>
                  <p className="mt-1 text-sm text-slate-500">Reason is optional.</p>
                </div>
                <div className="space-y-3 p-5">
                  <input
                    type="text"
                    value={reimbRejectDialog.reason}
                    onChange={(e) => setReimbRejectDialog({ ...reimbRejectDialog, reason: e.target.value })}
                    placeholder="Reason"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-outline" onClick={() => setReimbRejectDialog(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => void submitReimbReject()}>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
