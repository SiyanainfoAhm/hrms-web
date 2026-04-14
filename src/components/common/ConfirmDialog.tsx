"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { cn } from "../../lib/cn";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loading = false,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-6 animate-fade-in">
          <DialogTitle as="h3" className="text-lg font-semibold text-gray-900">
            {title}
          </DialogTitle>
          {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              onClick={onClose}
              disabled={loading}
            >
              {cancelText}
            </button>
            <button
              type="button"
              className={cn(
                "px-4 py-2 rounded font-semibold text-white transition disabled:opacity-60",
                danger ? "bg-red-600 hover:bg-red-700" : "bg-[var(--primary)] hover:brightness-95"
              )}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Working..." : confirmText}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

