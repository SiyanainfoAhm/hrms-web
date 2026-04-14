export type AppBranding = {
  appName: string;
  appShortName: string;
  supportEmail: string;
  logoText?: string;
  logoUrl?: string;
};

export const appConfig: AppBranding = {
  appName: "HRMS Web",
  appShortName: "HRMS",
  supportEmail: "support@example.com",
  logoText: "H"
};
