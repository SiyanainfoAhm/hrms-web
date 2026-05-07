"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getLocalStorageItem, setLocalStorageItem } from "../../lib/storage";

export type SidebarMode = "expanded" | "collapsed" | "hover";

type SidebarState = {
  expanded: boolean;
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  setExpanded: (value: boolean) => void;
  toggle: () => void;
  setHovering: (hovering: boolean) => void;
};

const SidebarStateContext = createContext<SidebarState | null>(null);

export function SidebarStateProvider({
  children,
  storageKey = "sidebarExpanded",
  modeStorageKey = "sidebarMode"
}: {
  children: React.ReactNode;
  storageKey?: string;
  modeStorageKey?: string;
}) {
  // IMPORTANT: Keep SSR/first-client-render deterministic to avoid hydration mismatches.
  // We'll sync stored preferences after mount.
  const [explicitExpanded, setExplicitExpanded] = useState(true);
  const [mode, setModeState] = useState<SidebarMode>("expanded");
  const [hovering, setHoveringState] = useState(false);

  const expanded = mode === "expanded" ? true : mode === "collapsed" ? false : hovering;

  useEffect(() => {
    const storedMode = getLocalStorageItem(modeStorageKey);
    if (storedMode === "expanded" || storedMode === "collapsed" || storedMode === "hover") {
      setModeState(storedMode);
      setExplicitExpanded(storedMode === "expanded");
      return;
    }

    const stored = getLocalStorageItem(storageKey);
    if (stored === "false") {
      setModeState("collapsed");
      setExplicitExpanded(false);
    } else if (stored === "true") {
      setModeState("expanded");
      setExplicitExpanded(true);
    }
  }, [modeStorageKey, storageKey]);

  const api = useMemo<SidebarState>(() => {
    function setExpanded(value: boolean) {
      setExplicitExpanded(value);
      setModeState(value ? "expanded" : "collapsed");
      setLocalStorageItem(storageKey, value ? "true" : "false");
      setLocalStorageItem(modeStorageKey, value ? "expanded" : "collapsed");
    }
    function setMode(nextMode: SidebarMode) {
      setModeState(nextMode);
      setLocalStorageItem(modeStorageKey, nextMode);
      if (nextMode === "expanded") {
        setExplicitExpanded(true);
        setLocalStorageItem(storageKey, "true");
      } else if (nextMode === "collapsed") {
        setExplicitExpanded(false);
        setLocalStorageItem(storageKey, "false");
      }
    }
    return {
      expanded,
      mode,
      setMode,
      setExpanded,
      toggle: () => {
        // Keep old toggle semantics for any existing callers.
        if (mode === "hover") {
          setMode("expanded");
          return;
        }
        setExpanded(!explicitExpanded);
      },
      setHovering: (h: boolean) => setHoveringState(h)
    };
  }, [expanded, explicitExpanded, mode, storageKey, modeStorageKey]);

  return <SidebarStateContext.Provider value={api}>{children}</SidebarStateContext.Provider>;
}

export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) throw new Error("useSidebarState must be used within SidebarStateProvider");
  return ctx;
}

