"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { TopbarTemplate } from "../../../components/layout/TopbarTemplate";
import { NotificationMenuTemplate, type NotificationItem } from "../../../components/layout/NotificationMenuTemplate";
import { AvatarMenu, type AvatarMenuUser } from "../../../components/layout/AvatarMenu";
import { GenericSearchBar } from "../../../components/crud/GenericSearchBar";
import { FilterBar } from "../../../components/crud/FilterBar";
import { GenericDataTable } from "../../../components/crud/GenericDataTable";
import { GenericEntityDialog } from "../../../components/crud/GenericEntityDialog";
import { ConfirmDialog } from "../../../components/common/ConfirmDialog";
import type { Actor } from "../../../lib/permissions";
import type { EntityField, TableColumn } from "../../../types/crud";

type DemoRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Inactive" | "Pending";
};

export default function DemoAppPage() {
  const router = useRouter();
  const actor: Actor = useMemo(() => {
    if (typeof window === "undefined") return { role: "viewer" as never };
    try {
      const u = JSON.parse(localStorage.getItem("demoUser") || "null") as { role?: string } | null;
      const role = (u?.role ?? "viewer") as Actor["role"];
      return { role };
    } catch {
      return { role: "viewer" as never };
    }
  }, []);

  const user: AvatarMenuUser = useMemo(() => {
    if (typeof window === "undefined") return { id: "u1", fullName: "User" };
    const raw = localStorage.getItem("demoUser");
    if (!raw) return { id: "u1", fullName: "User", roleLabel: "Viewer" };
    const u = JSON.parse(raw) as { id?: string; fullName?: string; email?: string; role?: string };
    return { id: u.id ?? "u1", fullName: u.fullName ?? "User", roleLabel: u.role ?? "viewer" };
  }, []);

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DemoRow[]>([
    { id: "r1", name: "Alex Morgan", email: "alex@example.com", role: "Manager", status: "Active" },
    { id: "r2", name: "Taylor Lee", email: "taylor@example.com", role: "Staff", status: "Pending" },
    { id: "r3", name: "Jordan Kim", email: "jordan@example.com", role: "Viewer", status: "Inactive" }
  ]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DemoRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState<DemoRow | null>(null);

  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: "n1", title: "Welcome", body: "This is a reusable notification menu template.", unread: true, createdAt: "Today" }
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const columns: TableColumn<DemoRow>[] = [
    {
      key: "name",
      header: "NAME",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--primary-soft)] flex items-center justify-center font-bold text-[var(--primary)] border">
            {r.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </div>
          <div className="font-semibold text-gray-900">{r.name}</div>
        </div>
      )
    },
    { key: "email", header: "EMAIL", sortable: true, sortValue: (r) => r.email, render: (r) => r.email },
    { key: "role", header: "ROLE", sortable: true, sortValue: (r) => r.role, render: (r) => r.role },
    {
      key: "status",
      header: "STATUS",
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            r.status === "Active"
              ? "bg-green-50 text-green-700"
              : r.status === "Inactive"
                ? "bg-gray-100 text-gray-500"
                : "bg-yellow-100 text-yellow-800"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              r.status === "Active" ? "bg-green-400" : r.status === "Inactive" ? "bg-gray-400" : "bg-yellow-400"
            }`}
          />
          {r.status}
        </span>
      )
    }
  ];

  const fields: EntityField<DemoRow>[] = [
    { key: "name", label: "Name", type: "text", required: true, placeholder: "Full name" },
    { key: "email", label: "Email", type: "email", required: true, placeholder: "email@example.com" },
    {
      key: "role",
      label: "Role",
      type: "select",
      options: [
        { label: "Manager", value: "Manager" },
        { label: "Staff", value: "Staff" },
        { label: "Viewer", value: "Viewer" }
      ]
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Active", value: "Active" },
        { label: "Inactive", value: "Inactive" },
        { label: "Pending", value: "Pending" }
      ]
    }
  ];

  const initialValues: DemoRow = editing ?? { id: crypto.randomUUID(), name: "", email: "", role: "Viewer", status: "Active" };

  return (
    <AppShell actor={actor}>
      <TopbarTemplate
        title="Demo: CRUD + layout templates"
        description="This page demonstrates the reusable shells (sidebar/topbar/avatar/notifications/table/dialogs)."
        right={
          <>
            <NotificationMenuTemplate
              count={unreadCount}
              loading={notifLoading}
              items={notifications}
              onOpen={async () => {
                setNotifLoading(true);
                // Demo-only: mimic fetching.
                await new Promise((r) => setTimeout(r, 300));
                setNotifLoading(false);
              }}
              onMarkAllRead={() =>
                setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
              }
              onViewAll={() => setNotifications((p) => p)}
            />
            <button
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-semibold hover:brightness-95 transition"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              type="button"
            >
              + Add record
            </button>
            <AvatarMenu
              user={user}
              onOpenProfile={() => router.push("/app/profile")}
              onLogout={() => {
                localStorage.removeItem("demoUser");
                router.push("/auth/login");
              }}
            />
          </>
        }
      />

      <div className="flex-1 p-6 sm:p-8 overflow-auto space-y-4">
        <FilterBar
          left={
            <GenericSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search records..."
              className="w-full sm:w-auto"
            />
          }
        />

        <GenericDataTable
          actor={actor}
          title="Records"
          description="Reusable sortable/searchable table shell. Replace the data callbacks to connect your API later."
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          searchQuery={search}
          searchKeys={[(r) => r.name, (r) => r.email, (r) => r.role, (r) => r.status]}
          rowActions={[
            {
              key: "edit",
              label: "Edit",
              onClick: (row) => {
                setEditing(row);
                setDialogOpen(true);
              }
            },
            {
              key: "delete",
              label: "Delete",
              intent: "danger",
              onClick: (row) => {
                setDeleting(row);
                setConfirmOpen(true);
              }
            }
          ]}
        />
      </div>

      <GenericEntityDialog
        open={dialogOpen}
        title={editing ? "Edit record" : "Add record"}
        description="Schema-driven add/edit dialog. Swap callbacks to connect to your backend."
        actor={actor}
        fields={fields}
        initialValues={initialValues}
        onClose={() => setDialogOpen(false)}
        onSubmit={async (values) => {
          setRows((prev) => {
            const exists = prev.some((r) => r.id === values.id);
            return exists ? prev.map((r) => (r.id === values.id ? values : r)) : [values, ...prev];
          });
          setDialogOpen(false);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete record?"
        description="This is a reusable confirm dialog. Wire it to your real delete handler later."
        danger
        confirmText="Delete"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (deleting) setRows((prev) => prev.filter((r) => r.id !== deleting.id));
          setConfirmOpen(false);
        }}
      />
    </AppShell>
  );
}

