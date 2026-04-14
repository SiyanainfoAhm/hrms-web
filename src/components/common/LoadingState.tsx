"use client";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="flex flex-col items-center">
        <svg
          className="animate-spin h-12 w-12 text-[var(--primary)] mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-[var(--primary)] font-semibold text-lg">{label}</span>
      </div>
    </div>
  );
}

