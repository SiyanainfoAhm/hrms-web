import type { ReactNode } from "react";
import { ToastProvider } from "../../components/common/ToastProvider";
import { DeviceGate } from "../../components/common/DeviceGate";
import { HrmsAgentWidget } from "../../components/hrms-agent/HrmsAgentWidget";

export default function AppSectionLayout({ children }: { children: ReactNode }) {
  const blocked = (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Mobile & tablet support is coming soon</p>
        <p className="mt-2 text-sm text-slate-700">
          Please open HRMS on a laptop/desktop browser to punch in/out and use the dashboard.
        </p>
      </div>
    </div>
  );
  return (
    <ToastProvider>
      {/* Block mobile/tablet web usage (incl. iPad desktop mode). */}
      <DeviceGate blocked={blocked}>
        <div className="lg:hidden">{blocked}</div>
        <div className="hidden lg:block">
          {children}
          {/* Floating HRMS chatbot — only renders for authenticated users
           * (the widget itself reads the demo session and bails when empty). */}
          <HrmsAgentWidget />
        </div>
      </DeviceGate>
    </ToastProvider>
  );
}
