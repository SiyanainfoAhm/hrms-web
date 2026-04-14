"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getLocalStorageItem, setLocalStorageItem } from "../../lib/storage";

type SidebarState = {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  toggle: () => void;
};

const SidebarStateContext = createContext<SidebarState | null>(null);

export function SidebarStateProvider({
  children,
  storageKey = "sidebarExpanded"
}: {
  children: React.ReactNode;
  storageKey?: string;
}) {
  const [expanded, setExpandedState] = useState(true);

  useEffect(() => {
    const stored = getLocalStorageItem(storageKey);
    if (stored === "true") setExpandedState(true);
    if (stored === "false") setExpandedState(false);
  }, [storageKey]);

  const api = useMemo<SidebarState>(() => {
    function setExpanded(value: boolean) {
      setExpandedState(value);
      setLocalStorageItem(storageKey, value ? "true" : "false");
    }
    return {
      expanded,
      setExpanded,
      toggle: () => setExpanded(!expanded)
    };
  }, [expanded, storageKey]);

  return <SidebarStateContext.Provider value={api}>{children}</SidebarStateContext.Provider>;
}

export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) throw new Error("useSidebarState must be used within SidebarStateProvider");
  return ctx;
}

