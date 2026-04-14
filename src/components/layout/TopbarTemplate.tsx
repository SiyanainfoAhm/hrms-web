"use client";

import { cn } from "../../lib/cn";

export function TopbarTemplate({
  title,
  description,
  right,
  sticky = true
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={cn(sticky && "sticky top-0 z-20", "bg-white border-b shadow-sm w-full")}>
      <div className="px-6 sm:px-8 py-4">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
            {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
          </div>
          {right && <div className="flex items-center gap-3">{right}</div>}
        </div>
      </div>
    </div>
  );
}

