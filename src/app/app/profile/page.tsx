import { Suspense } from "react";
import { HrmsShellPage } from "../../../components/layout/HrmsShellPage";
import { ProfileContent } from "../../../modules/profile/ProfileContent";
import { FullPageLoading } from "@/components/common/FullPageLoading";

export default function ProfilePage() {
  return (
    <HrmsShellPage title="My account" description="Profile, payslips, and onboarding documents.">
      <Suspense fallback={<FullPageLoading />}>
        <ProfileContent />
      </Suspense>
    </HrmsShellPage>
  );
}
