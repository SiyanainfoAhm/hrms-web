"use client";

import { cn } from "../../lib/cn";

export function AppDatePicker({
  value,
  onChange,
  label,
  min,
  max,
  disabled,
  name
}: {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label className="block">
      {label && <div className="block text-sm font-medium text-gray-700 mb-1">{label}</div>}
      <input
        type="date"
        name={name}
        value={value ?? ""}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white",
          "focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20",
          disabled && "bg-gray-100 text-gray-400 cursor-not-allowed"
        )}
      />
    </label>
  );
}

