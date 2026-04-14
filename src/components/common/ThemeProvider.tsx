"use client";

import { useEffect } from "react";
import { themeConfig } from "../../config/themeConfig";

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const t = themeConfig;
    setVar("--bg", t.colors.background);
    setVar("--surface", t.colors.surface);
    setVar("--text", t.colors.text);
    setVar("--muted", t.colors.muted);
    setVar("--border", t.colors.border);

    setVar("--primary", t.colors.primary);
    setVar("--primary-foreground", t.colors.primaryForeground);
    setVar("--primary-soft", t.colors.primarySoft);

    setVar("--danger", t.colors.danger);
    setVar("--success", t.colors.success);
    setVar("--warning", t.colors.warning);

    setVar("--radius-sm", t.radius.sm);
    setVar("--radius-md", t.radius.md);
    setVar("--radius-lg", t.radius.lg);

    setVar("--shadow-sm", t.shadow.sm);
    setVar("--shadow-md", t.shadow.md);

    setVar("--focus-ring", t.focus.ring);
  }, []);

  return children;
}

