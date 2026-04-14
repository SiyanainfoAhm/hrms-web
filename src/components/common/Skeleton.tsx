/** Pulse placeholders for loading states (tables, lists, text blocks). */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} aria-hidden />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full max-w-md"}`} />
      ))}
    </div>
  );
}

type SkeletonTableProps = { rows?: number; columns?: number };

export function SkeletonTable({ rows = 5, columns = 5 }: SkeletonTableProps) {
  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading table">
      <table className="w-full text-left text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri} className="border-t border-slate-200">
              {Array.from({ length: columns }).map((_, ci) => (
                <td key={ci} className="px-3 py-3">
                  <Skeleton className="h-4 w-full max-w-[10rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonList({ items = 4 }: { items?: number }) {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: items }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between border-t border-slate-200 pt-3 first:border-0 first:pt-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-20" />
        </li>
      ))}
    </ul>
  );
}
