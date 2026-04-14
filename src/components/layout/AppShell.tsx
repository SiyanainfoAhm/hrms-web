"use client";

import { SidebarStateProvider, useSidebarState } from "./SidebarState";
import { SidebarTemplate } from "./SidebarTemplate";
import type { Actor } from "../../lib/permissions";
import { cn } from "../../lib/cn";

function ShellInner({
  actor,
  children
}: {
  actor: Actor | null | undefined;
  children: React.ReactNode;
}) {
  const { expanded } = useSidebarState();
  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <SidebarTemplate actor={actor} />
      <main
        className={cn("flex-1 transition-all duration-200 flex flex-col min-h-screen")}
        style={{ marginLeft: expanded ? "14rem" : "4rem" }}
      >
        {children}
      </main>
    </div>
  );
}

export function AppShell({
  actor,
  children
}: {
  actor: Actor | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <SidebarStateProvider>
      <ShellInner actor={actor}>{children}</ShellInner>
    </SidebarStateProvider>
  );
}

