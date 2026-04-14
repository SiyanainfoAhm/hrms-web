/**
 * HRMS-aligned roles and permissions. Keep labels and permission keys stable for RBAC UI.
 */

export type RoleId = "super_admin" | "admin" | "hr" | "manager" | "employee";

export type PermissionId =
  | "app.view"
  | "employees.directory"
  | "employees.write"
  | "employees.delete"
  | "attendance.view"
  | "payroll.view"
  | "payroll.admin"
  | "approvals.view"
  | "approvals.act"
  | "holidays.view"
  | "settings.view"
  | "settings.company";

export type RoleDefinition = {
  id: RoleId;
  label: string;
  permissions: PermissionId[];
};

export const roleConfig: Record<RoleId, RoleDefinition> = {
  super_admin: {
    id: "super_admin",
    label: "Super Admin",
    permissions: [
      "app.view",
      "employees.directory",
      "employees.write",
      "employees.delete",
      "attendance.view",
      "payroll.view",
      "payroll.admin",
      "approvals.view",
      "approvals.act",
      "holidays.view",
      "settings.view",
      "settings.company"
    ]
  },
  admin: {
    id: "admin",
    label: "Admin",
    permissions: [
      "app.view",
      "employees.directory",
      "employees.write",
      "attendance.view",
      "payroll.view",
      "payroll.admin",
      "approvals.view",
      "approvals.act",
      "holidays.view",
      "settings.view"
    ]
  },
  hr: {
    id: "hr",
    label: "HR",
    permissions: [
      "app.view",
      "employees.directory",
      "employees.write",
      "attendance.view",
      "payroll.view",
      "payroll.admin",
      "approvals.view",
      "approvals.act",
      "holidays.view",
      "settings.view"
    ]
  },
  manager: {
    id: "manager",
    label: "Manager",
    permissions: ["app.view", "attendance.view", "approvals.view", "approvals.act", "holidays.view"]
  },
  employee: {
    id: "employee",
    label: "Employee",
    permissions: ["app.view", "attendance.view", "approvals.view", "holidays.view"]
  }
};
