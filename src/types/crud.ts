import type { PermissionId, RoleId } from "../config/roleConfig";

export type VisibilityRule = {
  anyRole?: RoleId[];
  anyPermission?: PermissionId[];
};

export type EntityFieldType =
  | "text"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "date"
  | "email"
  | "password"
  | "number"
  | "custom";

export type SelectOption = { label: string; value: string };

export type EntityField<TValues extends Record<string, unknown> = Record<string, unknown>> = {
  key: keyof TValues & string;
  label: string;
  type: EntityFieldType;
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: SelectOption[];
  visible?: VisibilityRule;
  editable?: VisibilityRule;
  render?: (ctx: {
    value: unknown;
    values: TValues;
    setValue: (next: unknown) => void;
    disabled: boolean;
  }) => React.ReactNode;
};

export type TableColumn<TRow> = {
  key: string;
  header: string;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: TRow) => string | number | boolean | null | undefined;
  render: (row: TRow) => React.ReactNode;
};

export type RowAction<TRow> = {
  key: string;
  label: string;
  /** Optional icon for compact action buttons (e.g. tables). */
  icon?: React.ReactNode;
  /** Optional extra classes for the action button. */
  className?: string;
  /** Compute extra classes per-row (useful for status coloring). */
  classNameForRow?: (row: TRow) => string | undefined;
  intent?: "default" | "danger";
  visible?: VisibilityRule;
  /** If set, action shows only when this returns true for the row. */
  visibleForRow?: (row: TRow) => boolean;
  onClick: (row: TRow) => void | Promise<void>;
};

