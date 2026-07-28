"use client";

import { getDemoUserFromStorage } from "@/lib/demoAuth";
import { publicUrlForStoragePath } from "@/lib/profilePictureStorage";
import { coercePhoneOptional } from "@/lib/phoneDisplay";

export type CurrentUserAvatarState = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  roleLabel: string;
  gender: string | null;
  profileImagePath: string | null;
  profileImageUrl: string | null;
};

type Listener = (state: CurrentUserAvatarState | null) => void;

let state: CurrentUserAvatarState | null = null;
let hasLoadedFromApi = false;
let loadPromise: Promise<CurrentUserAvatarState | null> | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(state);
}

function seedFromDemoUser(): CurrentUserAvatarState | null {
  const u = getDemoUserFromStorage();
  if (!u?.id) return null;
  return {
    id: u.id,
    fullName: u.fullName ?? "User",
    email: u.email,
    roleLabel: u.role ?? "employee",
    gender: null,
    profileImagePath: null,
    profileImageUrl: null,
  };
}

export function getCurrentUserAvatarSnapshot(): CurrentUserAvatarState | null {
  return state;
}

export function subscribeCurrentUserAvatar(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchCurrentUserAvatar(
  patch: Partial<
    Pick<
      CurrentUserAvatarState,
      "profileImagePath" | "profileImageUrl" | "gender" | "fullName" | "email" | "phone" | "roleLabel"
    >
  >,
): void {
  if (!state) {
    const seeded = seedFromDemoUser();
    if (!seeded) return;
    state = seeded;
  }

  const nextPath =
    patch.profileImagePath !== undefined ? patch.profileImagePath : state.profileImagePath;
  let nextUrl: string | null;
  if (patch.profileImageUrl !== undefined) {
    nextUrl = patch.profileImageUrl;
  } else if (nextPath) {
    nextUrl = publicUrlForStoragePath(nextPath);
  } else {
    nextUrl = null;
  }

  state = {
    ...state,
    ...patch,
    profileImagePath: nextPath,
    profileImageUrl: nextUrl,
  };
  notify();
}

export function clearCurrentUserAvatar(): void {
  state = null;
  hasLoadedFromApi = false;
  loadPromise = null;
  notify();
}

export async function ensureCurrentUserAvatar(opts?: {
  force?: boolean;
}): Promise<CurrentUserAvatarState | null> {
  if (!opts?.force && hasLoadedFromApi && state) return state;
  if (!opts?.force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    const seeded = seedFromDemoUser();
    if (seeded && !state) {
      state = seeded;
      notify();
    }

    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) {
        hasLoadedFromApi = true;
        return state;
      }
      const data = await res.json().catch(() => ({}));
      const user = data?.user;
      if (!user?.id) {
        hasLoadedFromApi = true;
        return state;
      }

      state = {
        id: String(user.id),
        fullName: (user.name as string | null) || seeded?.fullName || "User",
        email: (user.email as string | undefined) ?? seeded?.email,
        phone: coercePhoneOptional(user.phone),
        roleLabel: (user.role as string | undefined) ?? seeded?.roleLabel ?? "employee",
        gender: (user.gender as string | null) ?? null,
        profileImagePath: (user.profileImagePath as string | null) ?? null,
        profileImageUrl: (user.profileImageUrl as string | null) ?? null,
      };
      hasLoadedFromApi = true;
      notify();
      return state;
    } catch {
      hasLoadedFromApi = true;
      return state;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}
