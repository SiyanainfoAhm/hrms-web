export type RoleId = "owner" | "admin" | "manager" | "staff" | "viewer";

export type PermissionId =
  | "app.view"
  | "entity.create"
  | "entity.update"
  | "entity.delete"
  | "users.invite"
  | "billing.view";

export type RoleDefinition = {
  id: RoleId;
  label: string;
  permissions: PermissionId[];
};

export const roleConfig: Record<RoleId, RoleDefinition> = {
  owner: {
    id: "owner",
    label: "Owner",
    permissions: ["app.view", "entity.create", "entity.update", "entity.delete", "users.invite", "billing.view"]
  },
  admin: {
    id: "admin",
    label: "Admin",
    permissions: ["app.view", "entity.create", "entity.update", "entity.delete", "users.invite", "billing.view"]
  },
  manager: {
    id: "manager",
    label: "Manager",
    permissions: ["app.view", "entity.create", "entity.update", "users.invite"]
  },
  staff: {
    id: "staff",
    label: "Staff",
    permissions: ["app.view", "entity.create", "entity.update"]
  },
  viewer: {
    id: "viewer",
    label: "Viewer",
    permissions: ["app.view"]
  }
};

