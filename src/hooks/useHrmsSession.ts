"use client";

import { useLayoutEffect, useState } from "react";
import type { RoleId } from "../config/roleConfig";
import { getDemoUserFromStorage } from "../lib/demoAuth";

export type HrmsSession = {
  id: string;
  name: string;
  email?: string;
  role: RoleId;
};

function sessionFromStorage(): HrmsSession {
  const u = getDemoUserFromStorage();
  return {
    id: u?.id ?? "",
    name: u?.fullName ?? "",
    email: u?.email,
    role: (u?.role ?? "employee") as RoleId,
  };
}

export function useHrmsSession(): HrmsSession {
  const [s, setS] = useState<HrmsSession>({ id: "", name: "", role: "employee" });

  /** Read localStorage before paint so child useEffect (e.g. data fetches) sees the real role on first run. */
  useLayoutEffect(() => {
    setS(sessionFromStorage());
  }, []);

  return s;
}
