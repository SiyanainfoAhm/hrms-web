import { Suspense } from "react";
import { HrmsShellPage } from "../../../components/layout/HrmsShellPage";
import { SettingsContent } from "../../../modules/settings/SettingsContent";
import { FullPageLoading } from "@/components/common/FullPageLoading";

export default function SettingsPage() {
  return (
    <HrmsShellPage title="Settings" description="Company, organization, shifts, and roles.">
      <Suspense fallback={<FullPageLoading />}>
        <SettingsContent />
      </Suspense>
    </HrmsShellPage>
  );
}
