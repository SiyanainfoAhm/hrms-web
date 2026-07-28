"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Repeat2, User2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { EmployeeAvatar } from "../common/EmployeeAvatar";
import { useCurrentUserAvatar } from "../../hooks/useCurrentUserAvatar";
import { clearCurrentUserAvatar } from "../../lib/currentUserAvatarStore";

export type AvatarMenuUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  roleLabel?: string;
  gender?: string | null;
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
};

export type AvatarMenuAccount = AvatarMenuUser;

export function AvatarMenu({
  user,
  accounts,
  onSelectAccount,
  onOpenProfile,
  onLogout
}: {
  user: AvatarMenuUser | null | undefined;
  accounts?: AvatarMenuAccount[];
  onSelectAccount?: (accountId: string) => void;
  onOpenProfile?: () => void;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountModal, setAccountModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const liveUser = useCurrentUserAvatar();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const merged = useMemo((): AvatarMenuUser | null => {
    if (!user && !liveUser) return null;
    return {
      id: liveUser?.id ?? user?.id ?? "me",
      firstName: user?.firstName,
      lastName: user?.lastName,
      fullName: liveUser?.fullName ?? user?.fullName,
      email: liveUser?.email ?? user?.email,
      roleLabel: liveUser?.roleLabel ?? user?.roleLabel,
      gender: liveUser?.gender ?? user?.gender ?? null,
      profileImagePath: liveUser?.profileImagePath ?? user?.profileImagePath ?? null,
      profileImageUrl: liveUser?.profileImageUrl ?? user?.profileImageUrl ?? null,
    };
  }, [user, liveUser]);

  const displayName = useMemo(() => {
    if (!merged) return "User";
    if (merged.firstName && merged.lastName) return `${merged.firstName} ${merged.lastName}`;
    return merged.fullName ?? "User";
  }, [merged]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[var(--primary)]/25 bg-[var(--primary-soft)] focus:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open profile menu"
        type="button"
      >
        <EmployeeAvatar
          userId={merged?.id ?? "me"}
          name={displayName}
          gender={merged?.gender}
          profileImagePath={merged?.profileImagePath}
          profileImageUrl={merged?.profileImageUrl}
          fill
          bordered={false}
          className="border-0"
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg border border-gray-100 z-50 animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <EmployeeAvatar
              userId={merged?.id ?? "me"}
              name={displayName}
              gender={merged?.gender}
              profileImagePath={merged?.profileImagePath}
              profileImageUrl={merged?.profileImageUrl}
              size={36}
            />
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{displayName}</div>
              <div className="text-xs text-gray-500 truncate capitalize">{merged?.roleLabel ?? ""}</div>
            </div>
          </div>

          <button
            className="flex items-center gap-2 w-full px-4 py-3 text-gray-700 font-semibold hover:bg-gray-50 transition text-sm text-left"
            onClick={() => {
              setOpen(false);
              if (onOpenProfile) {
                onOpenProfile();
                return;
              }
              window.location.href = "/app/profile";
            }}
            type="button"
          >
            <User2 className="w-4 h-4 text-gray-500" />
            Profile
          </button>

          {accounts && accounts.length > 1 && (
            <button
              className="flex items-center gap-2 w-full px-4 py-3 text-[var(--primary)] font-semibold hover:bg-[var(--primary-soft)]/40 transition text-sm text-left"
              onClick={() => {
                setAccountModal(true);
                setOpen(false);
              }}
              type="button"
            >
              <Repeat2 className="w-4 h-4" />
              Switch account
            </button>
          )}

          <button
            className={cn(
              "flex items-center gap-2 w-full px-4 py-3 font-semibold transition text-sm text-left",
              onLogout ? "text-red-600 hover:bg-red-50" : "text-gray-300 cursor-not-allowed"
            )}
            onClick={() => {
              clearCurrentUserAvatar();
              onLogout?.();
            }}
            type="button"
            disabled={!onLogout}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}

      {accountModal && accounts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAccountModal(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm flex items-center flex-col relative animate-fade-in">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl font-bold focus:outline-none"
              onClick={() => setAccountModal(false)}
              aria-label="Close"
              type="button"
            >
              &times;
            </button>
            <h2 className="text-lg font-bold mb-4">Select account</h2>

            <div className="w-full grid grid-cols-1 gap-3">
              {accounts.map((a) => {
                const accountName =
                  a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.fullName ?? "User";
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      onSelectAccount?.(a.id);
                      setAccountModal(false);
                    }}
                    className="w-full border border-gray-300 rounded-lg flex items-center gap-3 px-4 py-3 hover:bg-[var(--primary-soft)]/30 transition text-left"
                    type="button"
                  >
                    <EmployeeAvatar
                      userId={a.id}
                      name={accountName}
                      gender={a.gender}
                      profileImagePath={a.profileImagePath}
                      profileImageUrl={a.profileImageUrl}
                      size={36}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{accountName}</div>
                      <div className="text-xs text-gray-500 truncate">{a.roleLabel ?? ""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
