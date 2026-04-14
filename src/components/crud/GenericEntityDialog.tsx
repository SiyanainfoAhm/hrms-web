"use client";

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useMemo, useState } from "react";
import type { Actor } from "../../lib/permissions";
import { isVisible } from "../../lib/visibility";
import { cn } from "../../lib/cn";
import type { EntityField } from "../../types/crud";

function canEdit(actor: Actor | null | undefined, rule: EntityField["editable"] | undefined) {
  if (!rule) return true;
  return isVisible(actor, rule);
}

export function GenericEntityDialog<TValues extends Record<string, unknown>>({
  open,
  title,
  description,
  actor,
  fields,
  initialValues,
  submitText = "Save",
  cancelText = "Cancel",
  loading = false,
  onClose,
  onSubmit
}: {
  open: boolean;
  title: string;
  description?: string;
  actor: Actor | null | undefined;
  fields: EntityField<TValues>[];
  initialValues: TValues;
  submitText?: string;
  cancelText?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: TValues) => void | Promise<void>;
}) {
  const [values, setValues] = useState<TValues>(initialValues);

  const visibleFields = useMemo(
    () => fields.filter((f) => isVisible(actor, f.visible)),
    [actor, fields]
  );

  function setValue(key: keyof TValues & string, next: unknown) {
    setValues((prev) => ({ ...prev, [key]: next } as TValues));
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-white/30 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-start justify-center pt-16 pb-16 p-4">
        <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-100 p-6 relative max-h-[85vh] overflow-y-auto animate-fade-in">
          <button
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold focus:outline-none"
            onClick={onClose}
            type="button"
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>

          <DialogTitle as="h2" className="text-xl font-semibold mb-1 text-gray-800">
            {title}
          </DialogTitle>
          {description && <p className="text-gray-500 text-sm mb-4">{description}</p>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit(values);
            }}
            className="space-y-3"
          >
            {visibleFields.map((field) => {
              const disabled = loading || !canEdit(actor, field.editable);
              const raw = values[field.key];
              const value = raw ?? (field.type === "checkbox" ? false : "");
              const commonInput = cn(
                "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white",
                "focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20",
                disabled && "bg-gray-100 text-gray-400 cursor-not-allowed"
              );

              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required ? <span className="text-red-500 ml-1">*</span> : null}
                  </label>

                  {field.type === "custom" && field.render ? (
                    field.render({
                      value,
                      values,
                      setValue: (next) => setValue(field.key, next),
                      disabled
                    })
                  ) : field.type === "textarea" ? (
                    <textarea
                      className={cn(commonInput, "min-h-[84px] resize-none")}
                      placeholder={field.placeholder}
                      disabled={disabled}
                      value={String(value)}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className={commonInput}
                      disabled={disabled}
                      value={String(value)}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    >
                      <option value="">{field.placeholder ?? "Select..."}</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={Boolean(value)}
                        disabled={disabled}
                        onChange={(e) => setValue(field.key, e.target.checked)}
                      />
                      {field.description && <span className="text-sm text-gray-600">{field.description}</span>}
                    </div>
                  ) : field.type === "radio" ? (
                    <div className="flex flex-col gap-2">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="radio"
                            name={field.key}
                            value={opt.value}
                            checked={String(value) === opt.value}
                            disabled={disabled}
                            onChange={() => setValue(field.key, opt.value)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={
                        field.type === "email"
                          ? "email"
                          : field.type === "password"
                            ? "password"
                            : field.type === "number"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                      }
                      className={commonInput}
                      placeholder={field.placeholder}
                      disabled={disabled}
                      value={String(value)}
                      onChange={(e) =>
                        setValue(
                          field.key,
                          field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                        )
                      }
                    />
                  )}

                  {field.description && field.type !== "checkbox" && (
                    <div className="text-xs text-gray-400 mt-1">{field.description}</div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                className="px-5 py-2.5 text-gray-600 font-medium hover:text-gray-800 transition"
                onClick={onClose}
                disabled={loading}
              >
                {cancelText}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:brightness-95 transition disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Saving..." : submitText}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

