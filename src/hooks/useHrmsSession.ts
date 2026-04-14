"use client";

import { useEffect, useState } from "react";
import type { RoleId } from "../config/roleConfig";
import { getDemoUserFromStorage } from "../lib/demoAuth";

export type HrmsSession = {
  id: string;
  name: string;
  email?: string;
  role: RoleId;
};

export function useHrmsSession(): HrmsSession {
  const [s, setS] = useState<HrmsSession>({ id: "", name: "", role: "employee" });

  useEffect(() => {
    const u = getDemoUserFromStorage();
    setS({
      id: u?.id ?? "",
      name: u?.fullName ?? "",
      email: u?.email,
      role: (u?.role ?? "employee") as RoleId
    });
  }, []);

  return s;
}
