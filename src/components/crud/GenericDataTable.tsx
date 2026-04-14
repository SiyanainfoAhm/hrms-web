"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDownUp, MoreHorizontal } from "lucide-react";
import type { Actor } from "../../lib/permissions";
import { cn } from "../../lib/cn";
import { isVisible } from "../../lib/visibility";
import type { RowAction, TableColumn } from "../../types/crud";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";

type SortDir = "asc" | "desc";

export function GenericDataTable<TRow>({
  actor,
  title,
  description,
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle,
  emptyDescription,
  searchQuery,
  searchKeys,
  onRowClick,
  rowActions,
  actionsHeader = "Actions"
}: {
  actor: Actor | null | undefined;
  title?: string;
  description?: string;
  columns: TableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  searchQuery?: string;
  searchKeys?: ((row: TRow) => string)[];
  onRowClick?: (row: TRow) => void;
  rowActions?: RowAction<TRow>[];
  actionsHeader?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    if (!searchQuery || !searchKeys || searchKeys.length === 0) return rows;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchKeys.some((fn) => (fn(r) ?? "").toLowerCase().includes(q)));
  }, [rows, searchKeys, searchQuery]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortable) return filtered;

    const get = col.sortValue ?? ((row: TRow) => String((col.render(row) as unknown) ?? ""));
    const dir = sortDir;
    return [...filtered].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const a1 = av ?? "";
      const b1 = bv ?? "";
      if (a1 < b1) return dir === "asc" ? -1 : 1;
      if (a1 > b1) return dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [columns, filtered, sortDir, sortKey]);

  const actionsForRow = useCallback(
    (row: TRow) =>
      (rowActions ?? []).filter((a) => isVisible(actor, a.visible) && (a.visibleForRow ? a.visibleForRow(row) : true)),
    [actor, rowActions]
  );

  return (
    <section className="bg-white rounded-lg shadow p-6 border border-gray-100">
      {(title || description) && (
        <div className="mb-4">
          {title && <div className="text-lg font-bold text-gray-900">{title}</div>}
          {description && <div className="text-sm text-gray-600 mt-1">{description}</div>}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : sorted.length === 0 ? (
        <EmptyState title={emptyTitle ?? "No records"} description={emptyDescription ?? "Try adjusting search or filters."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                {columns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className={cn("px-4 py-2 text-left text-xs font-semibold text-gray-500", col.className)}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-gray-700",
                            isSorted && "text-[var(--primary)]"
                          )}
                          onClick={() => {
                            if (!isSorted) {
                              setSortKey(col.key);
                              setSortDir("asc");
                            } else {
                              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }
                          }}
                        >
                          {col.header}
                          <ArrowDownUp className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {(rowActions ?? []).some((a) => isVisible(actor, a.visible)) && (
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">{actionsHeader}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((row) => {
                const visibleActions = actionsForRow(row);
                return (
                  <tr
                    key={rowKey(row)}
                    className={cn("hover:bg-gray-50 transition", onRowClick && "cursor-pointer")}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3 text-sm text-gray-700", col.className)}>
                        {col.render(row)}
                      </td>
                    ))}
                    {(rowActions ?? []).some((a) => isVisible(actor, a.visible)) && (
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex flex-wrap items-center gap-2">
                          {visibleActions.slice(0, 4).map((a) => (
                            <button
                              key={a.key}
                              type="button"
                              className={cn(
                                a.icon
                                  ? "inline-flex items-center justify-center h-8 w-8 rounded-lg border transition"
                                  : "text-sm font-medium hover:underline",
                                a.icon
                                  ? a.intent === "danger"
                                    ? "border-red-200 text-red-600 hover:bg-red-50"
                                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                                  : a.intent === "danger"
                                    ? "text-red-600"
                                    : "text-[var(--primary)]"
                                ,
                                // Allow per-action and per-row overrides (must come last)
                                a.className,
                                a.classNameForRow ? a.classNameForRow(row) : null,
                              )}
                              title={a.label}
                              aria-label={a.label}
                              onClick={(e) => {
                                e.stopPropagation();
                                void a.onClick(row);
                              }}
                            >
                              {a.icon ? (
                                <>
                                  {a.icon}
                                  <span className="sr-only">{a.label}</span>
                                </>
                              ) : (
                                a.label
                              )}
                            </button>
                          ))}
                          {visibleActions.length > 4 && (
                            <div className="text-gray-400" title="More actions">
                              <MoreHorizontal className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

