import type { RoleId, PermissionId } from "./roleConfig";

export type SidebarIconId =
  | "grid"
  | "users"
  | "user"
  | "clipboard"
  | "settings"
  | "credit-card"
  | "calendar"
  | "badge-check";

export type SidebarItem = {
  key: string;
  label: string;
  href: string;
  icon?: SidebarIconId;
  requiresAnyRole?: RoleId[];
  requiresAnyPermission?: PermissionId[];
};

export type SidebarSection = {
  key: string;
  label?: string;
  items: SidebarItem[];
};

const managerial: RoleId[] = ["super_admin", "admin", "hr"];

export const sidebarConfig: SidebarSection[] = [
  {
    key: "main",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: "grid", requiresAnyPermission: ["app.view"] },
      {
        key: "employees",
        label: "Employees",
        href: "/app/employees",
        icon: "users",
        requiresAnyPermission: ["employees.directory"]
      },
      {
        key: "attendance",
        label: "Attendance",
        href: "/app/attendance",
        icon: "calendar",
        requiresAnyPermission: ["attendance.view"]
      },
      {
        key: "holidays",
        label: "Holidays",
        href: "/app/holidays",
        icon: "badge-check",
        requiresAnyPermission: ["holidays.view"]
      },
      {
        key: "payroll",
        label: "Payroll",
        href: "/app/payroll",
        icon: "credit-card",
        requiresAnyPermission: ["payroll.admin"]
      },
      {
        key: "approvals",
        label: "Approvals",
        href: "/app/approvals",
        icon: "clipboard",
        requiresAnyPermission: ["approvals.view"]
      }
    ]
  },
  {
    key: "account",
    label: "Account",
    items: [
      { key: "profile", label: "Profile", href: "/app/profile", icon: "user", requiresAnyPermission: ["app.view"] },
      {
        key: "settings",
        label: "Settings",
        href: "/app/settings",
        icon: "settings",
        requiresAnyRole: managerial,
        requiresAnyPermission: ["settings.view"]
      }
    ]
  }
];
