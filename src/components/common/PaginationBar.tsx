"use client";

/**
 * Compact range + prev/next. Parent owns page state (e.g. server page or client slice page).
 */
export function PaginationBar({
  page,
  total,
  pageSize,
  loading,
  onPageChange,
  className = "",
}: {
  page: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
  className?: string;
}) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 ${className}`}>
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-outline !min-h-0 !px-2 !py-1 !text-[11px]"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-outline !min-h-0 !px-2 !py-1 !text-[11px]"
          disabled={loading || page * pageSize >= total}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
