import { employeeAvatarUrl } from "@/lib/employeeAvatarUrl";
import { resolveEmployeeAvatarSrc } from "@/lib/profilePictureStorage";

/**
 * Single resolution path for employee avatars:
 * uploaded profile image → Dicebear AvatarUrl → (initials only in UI on image error).
 */
export function resolveEmployeeAvatar(opts: {
  userId: string;
  gender?: string | null;
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
}): string {
  return resolveEmployeeAvatarSrc({
    userId: opts.userId,
    gender: opts.gender ?? null,
    profileImagePath: opts.profileImagePath,
    profileImageUrl: opts.profileImageUrl,
    fallbackAvatarUrl: employeeAvatarUrl,
  });
}

export function employeeDisplayInitials(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
