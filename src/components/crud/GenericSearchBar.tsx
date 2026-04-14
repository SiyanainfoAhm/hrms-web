"use client";

import { Search } from "lucide-react";

export function GenericSearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = ""
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 border rounded-lg bg-gray-50 px-3 py-2 ${className}`}>
      <Search className="h-5 w-5 text-gray-400" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm w-full min-w-[12rem]"
      />
    </div>
  );
}

