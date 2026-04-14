"use client";

import type { Actor } from "../../lib/permissions";
import type { EntityField } from "../../types/crud";
import { GenericEntityDialog } from "../crud/GenericEntityDialog";

export function ProfileEditDialog<TValues extends Record<string, unknown>>({
  open,
  actor,
  fields,
  initialValues,
  loading,
  onClose,
  onSubmit
}: {
  open: boolean;
  actor: Actor | null | undefined;
  fields: EntityField<TValues>[];
  initialValues: TValues;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: TValues) => void | Promise<void>;
}) {
  return (
    <GenericEntityDialog
      open={open}
      actor={actor}
      title="Edit profile"
      description="Update your information. Wire this dialog to your API later."
      fields={fields}
      initialValues={initialValues}
      submitText="Save changes"
      loading={loading}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

