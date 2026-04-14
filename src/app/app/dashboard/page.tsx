import { HrmsShellPage } from "../../../components/layout/HrmsShellPage";
import { DashboardContent } from "../../../modules/dashboard/DashboardContent";

export default function DashboardPage() {
  return (
    <HrmsShellPage title="Dashboard" description="Attendance, leave, pay, and quick links — same flows as HRMS.">
      <DashboardContent />
    </HrmsShellPage>
  );
}
