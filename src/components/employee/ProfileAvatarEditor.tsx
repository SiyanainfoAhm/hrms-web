"use client";

import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { InteractiveAvatar } from "@/components/common/InteractiveAvatar";
import { cn } from "@/lib/cn";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export type ProfileAvatarEditorProps = {
  userId: string;
  name: string;
  gender?: string | null;
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
  size?: number;
  hasUploadedPhoto: boolean;
  disabled?: boolean;
  waveOnHover?: boolean;
  initialGreeting?: boolean;
  onUploaded: (payload: { profileImagePath: string; profileImageUrl: string | null }) => void;
  onRemoved: () => void;
  onError: (message: string) => void;
  className?: string;
};

export function ProfileAvatarEditor({
  userId,
  name,
  gender = null,
  profileImagePath,
  profileImageUrl,
  size = 80,
  hasUploadedPhoto,
  disabled = false,
  waveOnHover = false,
  initialGreeting = false,
  onUploaded,
  onRemoved,
  onError,
  className,
}: ProfileAvatarEditorProps) {
  const menuId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    const ct = (file.type || "").toLowerCase();
    if (!ALLOWED_TYPES.has(ct)) {
      onError("Please select a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError("Profile picture must be smaller than 5 MB.");
      return;
    }

    setBusy("upload");
    setOpen(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/profile-picture", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(typeof data?.error === "string" ? data.error : "Unable to upload profile picture.");
        return;
      }
      onUploaded({
        profileImagePath: String(data.profileImagePath ?? ""),
        profileImageUrl: data.profileImageUrl ?? null,
      });
    } catch {
      onError("Unable to upload profile picture.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (busy || !hasUploadedPhoto) return;
    setBusy("remove");
    setOpen(false);
    try {
      const res = await fetch("/api/me/profile-picture", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(typeof data?.error === "string" ? data.error : "Unable to remove profile picture.");
        return;
      }
      onRemoved();
    } catch {
      onError("Unable to remove profile picture.");
    } finally {
      setBusy(null);
    }
  }

  const controlsDisabled = disabled || busy !== null;

  return (
    <div ref={rootRef} className={cn("group relative shrink-0", className)} style={{ width: size, height: size }}>
      <InteractiveAvatar
        userId={userId}
        name={name}
        gender={gender}
        profileImagePath={profileImagePath}
        profileImageUrl={profileImageUrl}
        alt={name}
        size={size}
        waveOnHover={waveOnHover}
        initialGreeting={initialGreeting}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        disabled={controlsDisabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={busy ? "Uploading…" : "Change profile photo"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white bg-[var(--primary)] text-white shadow-sm transition",
          "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
          "hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="sr-only">{busy === "upload" ? "Uploading…" : busy === "remove" ? "Removing…" : "Edit profile photo"}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-[10.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={controlsDisabled}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Upload photo
          </button>
          {hasUploadedPhoto ? (
            <button
              type="button"
              role="menuitem"
              disabled={controlsDisabled}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              onClick={() => void handleRemove()}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove photo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
