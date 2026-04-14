import type { RoleId } from "../config/roleConfig";

export type DemoUser = {
  id?: string;
  fullName?: string;
  email?: string;
  role?: RoleId;
};

export function getDemoUserFromStorage(): DemoUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("demoUser");
    if (!raw) return null;
    return JSON.parse(raw) as DemoUser;
  } catch {
    return null;
  }
}

