"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

type Ctx = {
  showToast: (kind: ToastKind, message: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const v = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastCtx.Provider value={v}>
      {children}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.kind === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : toast.kind === "success"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-slate-200 bg-white text-slate-800"
          }`}
        >
          {toast.message}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast requires ToastProvider");
  return c;
}
