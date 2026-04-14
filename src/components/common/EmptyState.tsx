"use client";

import { cn } from "../../lib/cn";

export function EmptyState({
  title = "Nothing here yet",
  description,
  action
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center font-bold border">
        ∅
      </div>
      <div className="mt-3 font-semibold text-gray-900">{title}</div>
      {description && <div className={cn("mt-1 text-sm text-gray-600 max-w-sm")}>{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

