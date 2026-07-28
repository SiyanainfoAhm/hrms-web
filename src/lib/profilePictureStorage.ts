/**
 * Profile picture storage helpers.
 * Bucket and public-URL pattern match existing leave/company logo uploads.
 */

export function getStorageBucket(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photomedia";
}

export function profilePictureFolder(userId: string): string {
  return `profile-pictures/${userId}`;
}

export function isOwnedProfilePicturePath(path: string, userId: string): boolean {
  const expectedPrefix = `${profilePictureFolder(userId)}/`;
  return Boolean(path) && path.startsWith(expectedPrefix) && !path.includes("..");
}

export function publicUrlForStoragePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const bucket = getStorageBucket();
  return `${base}/storage/v1/object/public/${bucket}/${trimmed}`;
}

export function resolveEmployeeAvatarSrc(opts: {
  userId: string;
  gender: string | null;
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
  fallbackAvatarUrl: (userId: string, gender: string | null) => string;
}): string {
  const explicitUrl = opts.profileImageUrl?.trim();
  if (explicitUrl) return explicitUrl;

  const path = opts.profileImagePath?.trim();
  if (path) {
    const fromPath = publicUrlForStoragePath(path);
    if (fromPath) return fromPath;
  }

  return opts.fallbackAvatarUrl(opts.userId, opts.gender);
}
