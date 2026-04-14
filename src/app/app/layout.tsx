import type { ReactNode } from "react";
import { ToastProvider } from "../../components/common/ToastProvider";

export default function AppSectionLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
