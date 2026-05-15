/** Shared legal entity details (keep in sync with hrms_mobile/lib/legal/legal_config.dart). */
export const legalConfig = {
  appName: "HRMS",
  legalEntityName: "Siyana Info Solution Private Limited",
  contactEmail: "hr@siyanainfo.com",
  registeredAddress:
    "Office 406/407, Navratna Corporate Park, NR Ashok Vatika, Ambli Road, Ambli, Ahmedabad, Gujarat 380015, India",
  privacyPolicyEffectiveDate: "15 May 2026",
  termsEffectiveDate: "15 May 2026",
  governingLawRegion: "India",
  /** Public account-deletion request page (Play Console). Append to web app base URL if needed. */
  accountDeletionPath: "/account-deletion",
} as const;
