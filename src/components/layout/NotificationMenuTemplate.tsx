"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "../../lib/cn";

export type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  createdAt?: string;
  unread?: boolean;
};

export function NotificationMenuTemplate({
  count,
  items,
  loading = false,
  onOpen,
  onItemClick,
  onMarkAllRead,
  onViewAll
}: {
  count: number;
  items: NotificationItem[];
  loading?: boolean;
  onOpen?: () => void | Promise<void>;
  onItemClick?: (item: NotificationItem) => void | Promise<void>;
  onMarkAllRead?: () => void | Promise<void>;
  onViewAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const canMarkAll = useMemo(() => count > 0 && !!onMarkAllRead, [count, onMarkAllRead]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-200 relative"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (!prev && onOpen) onOpen();
            return next;
          });
        }}
        type="button"
        aria-label="Open notifications"
      >
        <Bell className="w-5 h-5" />
        {!loading && count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-96 bg-white shadow rounded-xl z-50 border border-[var(--primary-soft)] animate-fade-in"
        >
          <div className="flex justify-between items-center px-4 py-3 bg-white rounded-t-xl">
            <span className="font-semibold text-base text-gray-800">Notifications</span>
            <button
              className={cn(
                "text-sm font-semibold hover:underline",
                canMarkAll ? "text-[var(--primary)]" : "text-gray-400 cursor-not-allowed"
              )}
              onClick={() => (canMarkAll ? onMarkAllRead?.() : undefined)}
              disabled={!canMarkAll}
              type="button"
            >
              Mark all as read
            </button>
          </div>
          <div>
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : items.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No notifications</div>
            ) : (
              items.slice(0, 3).map((notif) => (
                <button
                  key={notif.id}
                  className={cn(
                    "w-full text-left px-4 py-3 cursor-pointer",
                    notif.unread ? "bg-[var(--primary-soft)]/60 hover:bg-[var(--primary-soft)]" : "bg-white hover:bg-gray-50"
                  )}
                  onClick={() => onItemClick?.(notif)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-semibold text-gray-900 text-sm flex items-center">
                      {notif.title}
                      {notif.unread && <span className="w-2 h-2 bg-[var(--primary)] rounded-full ml-2" />}
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">{notif.createdAt ?? ""}</div>
                  </div>
                  {notif.body && <div className="text-sm text-gray-700 mt-0.5">{notif.body}</div>}
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-2 text-center">
            <button className="text-[var(--primary)] hover:underline text-sm" onClick={onViewAll} type="button">
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

