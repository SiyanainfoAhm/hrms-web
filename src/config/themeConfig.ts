export type ThemeTokens = {
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    primary: string;
    primaryForeground: string;
    primarySoft: string;
    danger: string;
    success: string;
    warning: string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
  };
  shadow: {
    sm: string;
    md: string;
  };
  focus: {
    ring: string;
  };
};

/**
 * Default theme is intentionally Sociomate-adjacent (clean white surfaces, violet accent),
 * but fully editable from this single file.
 */
export const themeConfig: ThemeTokens = {
  colors: {
    background: "#f7f8fa",
    surface: "#ffffff",
    text: "#111827",
    muted: "#6b7280",
    border: "#e5e7eb",
    primary: "#7c3aed",
    primaryForeground: "#ffffff",
    primarySoft: "#ede9fe",
    danger: "#dc2626",
    success: "#16a34a",
    warning: "#f59e0b"
  },
  radius: {
    sm: "10px",
    md: "14px",
    lg: "18px"
  },
  shadow: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.06)",
    md: "0 8px 24px rgba(17, 24, 39, 0.12)"
  },
  focus: {
    ring: "0 0 0 3px rgba(124, 58, 237, 0.22)"
  }
};

