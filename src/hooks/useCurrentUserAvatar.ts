"use client";

import { useEffect, useState } from "react";
import {
  ensureCurrentUserAvatar,
  getCurrentUserAvatarSnapshot,
  subscribeCurrentUserAvatar,
  type CurrentUserAvatarState,
} from "@/lib/currentUserAvatarStore";

/** Shared current-user avatar/profile fields for header + dropdown (one /api/me load). */
export function useCurrentUserAvatar(): CurrentUserAvatarState | null {
  const [user, setUser] = useState<CurrentUserAvatarState | null>(() => getCurrentUserAvatarSnapshot());

  useEffect(() => {
    const unsub = subscribeCurrentUserAvatar(setUser);
    void ensureCurrentUserAvatar();
    return unsub;
  }, []);

  return user;
}
