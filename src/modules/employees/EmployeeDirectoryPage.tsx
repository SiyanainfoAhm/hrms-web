"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/layout/AppShell";
import { TopbarTemplate } from "../../components/layout/TopbarTemplate";
import { AvatarMenu, type AvatarMenuUser } from "../../components/layout/AvatarMenu";
import { NotificationMenuTemplate, type NotificationItem } from "../../components/layout/NotificationMenuTemplate";
import { GenericSearchBar } from "../../components/crud/GenericSearchBar";
import { FilterBar } from "../../components/crud/FilterBar";
import { GenericDataTable } from "../../components/crud/GenericDataTable";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { CompanyDocumentsDialog } from "@/components/company/CompanyDocumentsDialog";
import type { Actor } from "../../lib/permissions";
import type { RoleId } from "../../config/roleConfig";
import type { TableColumn, RowAction } from "../../types/crud";
import { getDemoUserFromStorage } from "../../lib/demoAuth";
import { Eye, Pencil, UserCheck, UserX, Undo2, Trash2, FileText } from "lucide-react";
import {
  deleteEmployee,
  fetchCompanyMe,
  fetchEmployeesPage,
  patchEmployee,
  fetchOnboardingBundle,
} from "./employeeDirectoryService";
import type { EmployeeListRow, EmploymentStatusTab } from "./types";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { EmployeeDocumentsDialog } from "./EmployeeDocumentsDialog";
import { PreboardingDetailsDialog } from "./PreboardingDetailsDialog";

const PAGE_SIZE = 25;

function ymdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOnNotice(emp: EmployeeListRow): boolean {
  if (emp.employmentStatus !== "current") return false;
  const dol = emp.dateOfLeaving ?? "";
  const dolYmd = typeof dol === "string" ? dol.slice(0, 10) : "";
  return Boolean(dolYmd) && dolYmd > ymdToday();
}

function pastLabel(emp: EmployeeListRow): "Notice" | "Past" {
  const dol = emp.dateOfLeaving ?? "";
  const dolYmd = typeof dol === "string" ? dol.slice(0, 10) : "";
  if (!dolYmd) return "Past";
  return dolYmd > ymdToday() ? "Notice" : "Past";
}

export function EmployeeDirectoryPage() {
  const router = useRouter();
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<EmploymentStatusTab>("preboarding");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<EmployeeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [companyPt, setCompanyPt] = useState(200);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<EmployeeListRow | null>(null);
  const [convertKind, setConvertKind] = useState<"current" | "past">("current");
  const [convertDate, setConvertDate] = useState("");
  const [convertStep, setConvertStep] = useState<1 | 2>(1);
  const [convertPayrollForm, setConvertPayrollForm] = useState<Record<string, number> | null>(null);
  const [convertPrivatePreview, setConvertPrivatePreview] = useState<{
    grossMonthly: number;
    ctc: number;
    pfEmployee: number;
    esicEmployee: number;
    profTax: number;
    tds: number;
    takeHome: number;
  } | null>(null);
  const [convertPreviewLoading, setConvertPreviewLoading] = useState(false);
  const [convertSubmitting, setConvertSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeListRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [actor, setActor] = useState<Actor>({ role: "employee" });
  const [user, setUser] = useState<AvatarMenuUser>({ id: "me", fullName: "User", roleLabel: "employee" });
  const [docsOpen, setDocsOpen] = useState(false);
  const [empDocsOpen, setEmpDocsOpen] = useState(false);
  const [empDocsUserId, setEmpDocsUserId] = useState<string | null>(null);

  useEffect(() => {
    const u = getDemoUserFromStorage();
    const role = (u?.role ?? "employee") as RoleId;
    setActor({ role });
    setUser({
      id: u?.id ?? "me",
      fullName: u?.fullName ?? "User",
      email: u?.email,
      roleLabel: u?.role ?? "employee"
    });
  }, []);

  const canManageCompanyDocs = actor.role === "super_admin" || actor.role === "admin" || actor.role === "hr";
  const canManageEmployeeDocs = canManageCompanyDocs;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setListError(null);
      try {
        const data = await fetchEmployeesPage({ page, pageSize: PAGE_SIZE, employmentStatus: activeTab });
        if (cancelled) return;
        setRows(data.employees ?? []);
        setTotal(data.total ?? 0);
      } catch (e) {
        if (!cancelled) setListError(e instanceof Error ? e.message : "Failed to load employees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, activeTab, tick]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { company } = await fetchCompanyMe();
        if (cancelled || !company) return;
        const pt = company.professional_tax_monthly ?? 200;
        setCompanyPt(Number(pt));
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: TableColumn<EmployeeListRow>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Employee",
        sortable: true,
        sortValue: (r) => r.name ?? r.email,
        render: (r) => (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[var(--primary-soft)] flex items-center justify-center font-bold text-[var(--primary)] border shrink-0">
              {(r.name ?? r.email)
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{r.name || "—"}</div>
              <div className="text-xs text-gray-500 truncate">{r.email}</div>
            </div>
          </div>
        )
      },
      {
        key: "code",
        header: "Code",
        sortable: true,
        sortValue: (r) => r.employeeCode,
        render: (r) => <span className="text-sm text-gray-800">{r.employeeCode || "—"}</span>
      },
      {
        key: "role",
        header: "Role",
        sortable: true,
        sortValue: (r) => r.role,
        render: (r) => <span className="text-sm capitalize">{r.role.replace("_", " ")}</span>
      },
      {
        key: "org",
        header: "Org",
        sortable: true,
        sortValue: (r) => `${r.divisionName ?? ""} ${r.departmentName ?? ""}`,
        render: (r) => (
          <div className="text-sm text-gray-700">
            <div className="truncate max-w-[10rem] sm:max-w-[14rem]">{r.designation || "—"}</div>
            <div className="text-xs text-gray-500 truncate max-w-[10rem] sm:max-w-[14rem]">
              {[r.divisionName, r.departmentName].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        )
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        sortValue: (r) => r.employmentStatus,
        render: (r) => {
          if (activeTab === "past" && r.employmentStatus === "current" && isOnNotice(r)) {
            return (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800">
                On notice
              </span>
            );
          }
          if (activeTab === "preboarding" && r.preboardingDocsComplete === false) {
            return (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-900">
                Docs pending
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">
              {r.employmentStatus}
            </span>
          );
        }
      }
    ],
    [activeTab]
  );

  const rowActions: RowAction<EmployeeListRow>[] = useMemo(
    () => [
      {
        key: "view",
        label: "Details",
        icon: <Eye className="w-4 h-4" />,
        visible: { anyPermission: ["employees.directory"] },
        classNameForRow: (r) => {
          if (activeTab !== "preboarding") return undefined;
          // Make completed docs stand out: filled green button + white icon
          return r.preboardingDocsComplete
            ? "bg-green-600 border-green-600 text-white hover:bg-green-700"
            : undefined;
        },
        onClick: async (r) => {
          setDetailsOpen(true);
          setDetailsUserId(r.id);
          setDetailsLoading(true);
          try {
            await fetchOnboardingBundle(r.id);
          } catch (e) {
            // dialog handles its own error display; keep this best-effort
          } finally {
            setDetailsLoading(false);
          }
        }
      },
      {
        key: "documents",
        label: "Documents",
        icon: <FileText className="w-4 h-4" />,
        visible: { anyPermission: ["employees.write"] },
        onClick: (r) => {
          setEmpDocsUserId(r.id);
          setEmpDocsOpen(true);
        }
      },
      {
        key: "edit",
        label: "Edit",
        icon: <Pencil className="w-4 h-4" />,
        visible: { anyPermission: ["employees.write"] },
        onClick: (r) => {
          setFormMode("edit");
          setEditId(r.id);
          setFormOpen(true);
        }
      },
      {
        key: "convert-current",
        label: "Mark current",
        icon: <UserCheck className="w-4 h-4" />,
        visible: { anyPermission: ["employees.write"] },
        visibleForRow: (r) => {
          const notice = isOnNotice(r);
          return activeTab === "preboarding" || (activeTab === "current" && notice);
        },
        onClick: (r) => {
          setConvertKind("current");
          setConvertTarget(r);
          setConvertDate(new Date().toISOString().slice(0, 10));
          setConvertStep(1);
          setConvertPayrollForm(null);
          setConvertOpen(true);
        }
      },
      {
        key: "convert-past",
        label: "Offboard",
        icon: <UserX className="w-4 h-4" />,
        visible: { anyPermission: ["employees.write"] },
        visibleForRow: (r) => activeTab === "current" && !isOnNotice(r),
        onClick: (r) => {
          setConvertKind("past");
          setConvertTarget(r);
          setConvertDate(new Date().toISOString().slice(0, 10));
          setConvertOpen(true);
        }
      },
      {
        key: "revoke-notice",
        label: "Revoke notice",
        icon: <Undo2 className="w-4 h-4" />,
        visible: { anyPermission: ["employees.write"] },
        visibleForRow: (r) => activeTab === "past" && r.employmentStatus === "current" && isOnNotice(r),
        onClick: async (r) => {
          try {
            await patchEmployee({ action: "revoke_notice", userId: r.id });
            setFlash({ kind: "success", text: "Notice revoked." });
            refresh();
          } catch (e) {
            setFlash({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
          }
        }
      },
      {
        key: "delete",
        label: "Delete",
        icon: <Trash2 className="w-4 h-4" />,
        intent: "danger",
        visible: { anyRole: ["super_admin"], anyPermission: ["employees.delete"] },
        onClick: (r) => setDeleteTarget(r)
      }
    ],
    [activeTab, refresh]
  );

  async function runConvertPreview() {
    if (!convertTarget) return;
    setConvertPreviewLoading(true);
    try {
      const data = (await patchEmployee({
        action: "preview_convert_to_current",
        userId: convertTarget.id,
        dateOfJoining: convertDate || undefined
      })) as { payrollMaster?: Record<string, number>; payrollMode?: string; computed?: any };
      if (data?.payrollMode === "private") {
        setConvertPayrollForm(null);
        setConvertPrivatePreview(data?.computed ?? null);
        setConvertStep(2);
      } else {
        setConvertPrivatePreview(null);
        setConvertPayrollForm((data.payrollMaster as Record<string, number>) ?? null);
        setConvertStep(2);
      }
    } catch (e) {
      setFlash({ kind: "error", text: e instanceof Error ? e.message : "Preview failed" });
    } finally {
      setConvertPreviewLoading(false);
    }
  }

  async function confirmConvert() {
    if (!convertTarget) return;
    setConvertSubmitting(true);
    try {
      if (convertKind === "past") {
        await patchEmployee({
          action: "convert_to_past",
          userId: convertTarget.id,
          lastWorkingDate: convertDate || undefined
        });
        setFlash({ kind: "success", text: "Employee updated." });
      } else {
        await patchEmployee({
          action: "convert_to_current",
          userId: convertTarget.id,
          dateOfJoining: convertDate || undefined,
          payrollMode: convertPayrollForm ? "government" : "private",
          payrollMaster: convertPayrollForm ?? undefined
        });
        setFlash({ kind: "success", text: "Employee is now current. Payroll master created if missing." });
      }
      setConvertOpen(false);
      refresh();
    } catch (e) {
      setFlash({ kind: "error", text: e instanceof Error ? e.message : "Conversion failed" });
    } finally {
      setConvertSubmitting(false);
    }
  }

  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell actor={actor}>
      <TopbarTemplate
        title="Employee directory"
        description="Preboarding, current, and past employees — same rules and APIs as HRMS."
        right={
          <>
            <NotificationMenuTemplate
              count={unreadCount}
              loading={false}
              items={notifications}
              onOpen={async () => {}}
              onMarkAllRead={() => setNotifications((p) => p.map((n) => ({ ...n, unread: false })))}
              onViewAll={() => {}}
            />
            <button
              type="button"
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-semibold hover:brightness-95 transition text-sm"
              onClick={() => {
                setFormMode("add");
                setEditId(null);
                setFormOpen(true);
              }}
            >
              + Add employee
            </button>
            {canManageCompanyDocs && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition text-sm"
                onClick={() => setDocsOpen(true)}
              >
                Company documents
              </button>
            )}
            <AvatarMenu
              user={user}
              onOpenProfile={() => router.push("/app/profile")}
              onLogout={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch {
                  /* ignore */
                }
                localStorage.removeItem("demoUser");
                router.push("/auth/login");
              }}
            />
          </>
        }
      />

      <div className="flex-1 p-4 sm:p-8 overflow-auto space-y-4">
        {flash && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              flash.kind === "success"
                ? "bg-green-50 border-green-100 text-green-900"
                : "bg-red-50 border-red-100 text-red-900"
            }`}
          >
            {flash.text}
            <button type="button" className="ml-3 underline text-xs" onClick={() => setFlash(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(["preboarding", "current", "past"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                activeTab === tab
                  ? "bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--primary)]"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab === "preboarding" ? "Preboard" : tab === "current" ? "Current" : "Past"}
            </button>
          ))}
        </div>

        <FilterBar
          left={
            <GenericSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search this page…"
              className="w-full sm:w-72"
            />
          }
        />

        {listError && <div className="text-sm text-red-600">{listError}</div>}

        <GenericDataTable
          actor={actor}
          title="Employees"
          description={`Showing page ${page} of ${maxPage} · ${total} total`}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          searchQuery={search}
          searchKeys={[(r) => r.name ?? "", (r) => r.email, (r) => r.employeeCode, (r) => r.designation ?? ""]}
          rowActions={rowActions}
        />

        {/* Pagination (server-side) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600">
          <div>
            Page {page} / {maxPage} · {total} records
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
              disabled={page >= maxPage || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <EmployeeFormModal
        open={formOpen}
        mode={formMode}
        userId={editId}
        onClose={() => {
          setFormOpen(false);
          setEditId(null);
        }}
        onSaved={(msg) => {
          setFlash({ kind: "success", text: msg });
          refresh();
        }}
        onToast={(kind, msg) => setFlash({ kind, text: msg })}
      />

      <CompanyDocumentsDialog open={docsOpen && canManageCompanyDocs} onClose={() => setDocsOpen(false)} />

      <EmployeeDocumentsDialog
        open={empDocsOpen && canManageEmployeeDocs}
        userId={empDocsUserId}
        onClose={() => {
          setEmpDocsOpen(false);
          setEmpDocsUserId(null);
        }}
        onToast={(kind, msg) => setFlash({ kind, text: msg })}
      />

      <PreboardingDetailsDialog
        open={detailsOpen}
        userId={detailsUserId}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsUserId(null);
        }}
        onToast={(kind, msg) => setFlash({ kind, text: msg })}
      />

      {convertOpen && convertTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <h3 className="font-bold text-lg text-gray-900">
              {convertKind === "current" ? "Convert to current" : "Offboard employee"}
            </h3>
            {convertKind === "past" && (
              <>
                <p className="text-sm text-gray-600">
                  Sets last working day. If the date is in the future, employment stays current until that date (
                  {pastLabel(convertTarget)} workflow).
                </p>
                <label className="block text-sm">
                  <span className="text-gray-600">Last working date</span>
                  <input
                    type="date"
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2"
                    value={convertDate}
                    onChange={(e) => setConvertDate(e.target.value)}
                  />
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="px-4 py-2 rounded-lg border border-gray-200" onClick={() => setConvertOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-50"
                    disabled={convertSubmitting}
                    onClick={() => void confirmConvert()}
                  >
                    {convertSubmitting ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </>
            )}
            {convertKind === "current" && convertStep === 1 && (
              <>
                <p className="text-sm text-gray-600">Confirms mandatory documents (when invite completed) and loads payroll preview.</p>
                <label className="block text-sm">
                  <span className="text-gray-600">Date of joining</span>
                  <input
                    type="date"
                    className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2"
                    value={convertDate}
                    onChange={(e) => setConvertDate(e.target.value)}
                  />
                </label>
                <p className="text-xs text-gray-500">Company PT (monthly) used in preview: ₹{companyPt}</p>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="px-4 py-2 rounded-lg border border-gray-200" onClick={() => setConvertOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-50"
                    disabled={convertPreviewLoading}
                    onClick={() => void runConvertPreview()}
                  >
                    {convertPreviewLoading ? "Loading preview…" : "Continue"}
                  </button>
                </div>
              </>
            )}
            {convertKind === "current" && convertStep === 2 && convertPayrollForm && (
              <>
                <p className="text-sm text-gray-600">Review payroll master numbers (defaults from government conversion). Adjust if needed.</p>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto text-sm">
                  {Object.entries(convertPayrollForm).map(([k, v]) => (
                    <label key={k} className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-400 truncate">{k}</span>
                      <input
                        type="number"
                        className="rounded border border-gray-200 px-2 py-1"
                        value={Number(v)}
                        onChange={(e) =>
                          setConvertPayrollForm((prev) =>
                            prev ? { ...prev, [k]: Number(e.target.value) } : prev
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" className="px-4 py-2 rounded-lg border border-gray-200" onClick={() => setConvertStep(1)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-50"
                    disabled={convertSubmitting}
                    onClick={() => void confirmConvert()}
                  >
                    {convertSubmitting ? "Saving…" : "Mark current"}
                  </button>
                </div>
              </>
            )}
            {convertKind === "current" && convertStep === 2 && !convertPayrollForm && convertPrivatePreview && (
              <>
                <p className="text-sm text-gray-600">
                  Private payroll preview (no government slab). This will create a private payroll master if missing.
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">Gross</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.grossMonthly || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">CTC</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.ctc || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">PF (Emp)</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.pfEmployee || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">ESIC (Emp)</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.esicEmployee || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">PT</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.profTax || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-gray-500">TDS</div>
                    <div className="font-semibold">₹{Number(convertPrivatePreview.tds || 0).toLocaleString("en-IN")}</div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                    <div className="text-[10px] uppercase text-green-700">Take-home</div>
                    <div className="font-bold text-green-900">₹{Number(convertPrivatePreview.takeHome || 0).toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" className="px-4 py-2 rounded-lg border border-gray-200" onClick={() => setConvertStep(1)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-50"
                    disabled={convertSubmitting}
                    onClick={() => void confirmConvert()}
                  >
                    {convertSubmitting ? "Saving…" : "Mark current"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete employee?"
        description="This permanently removes the user (super admin only). This cannot be undone."
        confirmText="Delete"
        danger
        loading={deleteLoading}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteLoading(true);
          try {
            await deleteEmployee(deleteTarget.id);
            setFlash({ kind: "success", text: "Employee deleted." });
            setDeleteTarget(null);
            refresh();
          } catch (e) {
            setFlash({ kind: "error", text: e instanceof Error ? e.message : "Delete failed" });
          } finally {
            setDeleteLoading(false);
          }
        }}
      />
    </AppShell>
  );
}
