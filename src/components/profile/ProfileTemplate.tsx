"use client";

import { useMemo, useState } from "react";
import type { Actor } from "../../lib/permissions";
import { isVisible } from "../../lib/visibility";
import type { EntityField, VisibilityRule } from "../../types/crud";
import { cn } from "../../lib/cn";
import { ProfileEditDialog } from "./ProfileEditDialog";
import { ProfileFieldRow, ProfileSection } from "./ProfileBlocks";

export type ProfileUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  roleLabel?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
};

type ProfileSectionConfig = {
  key: string;
  title: string;
  description?: string;
  visible?: VisibilityRule;
  rows: Array<{ label: string; value?: React.ReactNode; visible?: VisibilityRule }>;
};

function initials(u: ProfileUser | null | undefined) {
  const name = (u?.firstName && u?.lastName ? `${u.firstName} ${u.lastName}` : u?.fullName)?.trim();
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileTemplate<TValues extends Record<string, unknown>>({
  actor,
  user,
  sections,
  editFields,
  editInitialValues,
  canEdit,
  onSave
}: {
  actor: Actor | null | undefined;
  user: ProfileUser | null | undefined;
  sections: ProfileSectionConfig[];
  editFields: EntityField<TValues>[];
  editInitialValues: TValues;
  canEdit?: boolean | VisibilityRule;
  onSave: (values: TValues) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const allowEdit = useMemo(() => {
    if (typeof canEdit === "boolean") return canEdit;
    if (!canEdit) return true;
    return isVisible(actor, canEdit);
  }, [actor, canEdit]);

  const name =
    user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.fullName ?? "User";

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="bg-white rounded-xl shadow border border-gray-100 p-6 flex items-start justify-between gap-4 flex-col sm:flex-row">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] border flex items-center justify-center font-bold text-xl">
            {initials(user)}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-gray-900 truncate">{name}</div>
            <div className="text-sm text-gray-600 truncate">{user?.roleLabel ?? ""}</div>
            <div className="text-xs text-gray-400 mt-1 truncate">{user?.email ?? ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "px-4 py-2 rounded-lg font-semibold transition",
              allowEdit ? "bg-[var(--primary)] text-white hover:brightness-95" : "bg-gray-200 text-gray-500 cursor-not-allowed"
            )}
            onClick={() => allowEdit && setOpen(true)}
            disabled={!allowEdit}
          >
            Edit profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections
          .filter((s) => isVisible(actor, s.visible))
          .map((s) => (
            <ProfileSection key={s.key} title={s.title} description={s.description}>
              {s.rows
                .filter((r) => isVisible(actor, r.visible))
                .map((r, idx) => (
                  <ProfileFieldRow key={`${s.key}-${idx}`} label={r.label} value={r.value} />
                ))}
            </ProfileSection>
          ))}
      </div>

      <ProfileEditDialog
        open={open}
        actor={actor}
        fields={editFields}
        initialValues={editInitialValues}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          await onSave(values);
          setOpen(false);
        }}
      />
    </div>
  );
}

