"use client";

import { cn } from "../../lib/cn";

export function ProfileSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl shadow border border-gray-100 p-6">
      <div className="mb-4">
        <div className="font-bold text-gray-900">{title}</div>
        {description && <div className="text-sm text-gray-600 mt-1">{description}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ProfileFieldRow({
  label,
  value,
  right,
  muted
}: {
  label: string;
  value?: React.ReactNode;
  right?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
        <div className={cn("mt-0.5 text-sm font-medium break-words", muted ? "text-gray-500" : "text-gray-900")}>
          {value ?? <span className="text-gray-400">—</span>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

