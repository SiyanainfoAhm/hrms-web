export type AppBranding = {
  appName: string;
  appShortName: string;
  supportEmail: string;
  logoText?: string;
  logoUrl?: string;
  /** Shown on the branded panel of auth screens */
  tagline?: string;
};

export const appConfig: AppBranding = {
  appName: "HR Management System",
  appShortName: "HRMS",
  supportEmail: "support@example.com",
  logoText: "H",
  logoUrl: "/branding/hrms-agent.png",
  tagline: "Manage attendance, leave, and payroll in one place."
};
