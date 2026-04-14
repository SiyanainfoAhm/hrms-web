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
  intent?: "default" | "danger";
  visible?: VisibilityRule;
  onClick: (row: TRow) => void | Promise<void>;
};

