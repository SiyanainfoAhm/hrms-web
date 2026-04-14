import type { RoleId, PermissionId } from "./roleConfig";

export type SidebarItem = {
  key: string;
  label: string;
  href: string;
  icon?: "grid" | "users" | "clipboard" | "settings" | "credit-card" | "bell";
  requiresAnyRole?: RoleId[];
  requiresAnyPermission?: PermissionId[];
};

export type SidebarSection = {
  key: string;
  label?: string;
  items: SidebarItem[];
};

export const sidebarConfig: SidebarSection[] = [
  {
    key: "main",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/app/demo", icon: "grid" },
      {
        key: "entities",
        label: "Entities",
        href: "/app/demo#entities",
        icon: "clipboard",
        requiresAnyPermission: ["entity.create", "entity.update"]
      },
      {
        key: "users",
        label: "Users",
        href: "/app/demo#users",
        icon: "users",
        requiresAnyPermission: ["users.invite"]
      },
      {
        key: "billing",
        label: "Billing",
        href: "/app/demo#billing",
        icon: "credit-card",
        requiresAnyPermission: ["billing.view"]
      }
    ]
  },
  {
    key: "system",
    label: "System",
    items: [
      { key: "settings", label: "Settings", href: "/app/demo#settings", icon: "settings" }
    ]
  }
];

