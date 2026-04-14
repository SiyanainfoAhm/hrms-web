"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { TopbarTemplate } from "./TopbarTemplate";
import { AvatarMenu, type AvatarMenuUser } from "./AvatarMenu";
import type { Actor } from "../../lib/permissions";
import type { RoleId } from "../../config/roleConfig";
import { getDemoUserFromStorage } from "../../lib/demoAuth";

export function HrmsShellPage({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [actor, setActor] = useState<Actor>({ role: "employee" });
  const [user, setUser] = useState<AvatarMenuUser>({ id: "me", fullName: "User", roleLabel: "employee" });

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

  const right = useMemo(
    () => (
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
    ),
    [router, user]
  );

  return (
    <AppShell actor={actor}>
      <TopbarTemplate title={title} description={description} right={right} />
      <div className="flex-1 p-4 sm:p-8 overflow-auto">{children}</div>
    </AppShell>
  );
}
