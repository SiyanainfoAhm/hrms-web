import { Suspense } from "react";
import { HrmsShellPage } from "../../../components/layout/HrmsShellPage";
import { ApprovalsContent } from "../../../modules/approvals/ApprovalsContent";
import { FullPageLoading } from "@/components/common/FullPageLoading";

export default function ApprovalsPage() {
  return (
    <HrmsShellPage title="Approvals" description="Leave and reimbursement approvals.">
      <Suspense fallback={<FullPageLoading />}>
        <ApprovalsContent />
      </Suspense>
    </HrmsShellPage>
  );
}
