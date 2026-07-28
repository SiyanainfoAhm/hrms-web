"use client";

import { useEffect, useState } from "react";
import { employeeAvatarUrl } from "@/lib/employeeAvatarUrl";
import { employeeDisplayInitials } from "@/lib/resolveEmployeeAvatar";
import { publicUrlForStoragePath } from "@/lib/profilePictureStorage";
import { cn } from "@/lib/cn";

type FallbackStage = "uploaded" | "generated" | "initials";

export type EmployeeAvatarProps = {
  userId: string;
  name?: string | null;
  gender?: string | null;
  profileImagePath?: string | null;
  profileImageUrl?: string | null;
  /** Diameter in px. Ignored when `fill` is true. */
  size?: number;
  /** Fill the parent instead of using a fixed size. */
  fill?: boolean;
  /** Subtle primary border (header / directory default). */
  bordered?: boolean;
  className?: string;
  alt?: string;
};

function resolveUploadedUrl(
  profileImageUrl?: string | null,
  profileImagePath?: string | null,
): string | null {
  const explicit = profileImageUrl?.trim();
  if (explicit) return explicit;
  const path = profileImagePath?.trim();
  if (path) return publicUrlForStoragePath(path);
  return null;
}

export function EmployeeAvatar({
  userId,
  name,
  gender = null,
  profileImagePath,
  profileImageUrl,
  size = 32,
  fill = false,
  bordered = true,
  className,
  alt,
}: EmployeeAvatarProps) {
  const uploaded = resolveUploadedUrl(profileImageUrl, profileImagePath);
  const generated = userId ? employeeAvatarUrl(userId, gender) : "";
  const displayName = (name ?? "").trim() || "Employee";
  const initials = employeeDisplayInitials(displayName);
  const resolvedAlt = alt ?? `${displayName} profile picture`;

  const [stage, setStage] = useState<FallbackStage>(() => (uploaded ? "uploaded" : "generated"));

  useEffect(() => {
    setStage(uploaded ? "uploaded" : "generated");
  }, [uploaded, userId, gender, profileImagePath, profileImageUrl]);

  const src = stage === "uploaded" ? uploaded : stage === "generated" ? generated : null;

  const sizeStyle = fill
    ? undefined
    : ({ width: size, height: size, minWidth: size, minHeight: size } as const);

  const fontSize = fill ? undefined : Math.max(10, Math.round(size * 0.36));

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-[var(--primary)]",
        bordered && "border border-[var(--primary)]/25",
        fill && "h-full w-full",
        className,
      )}
      style={sizeStyle}
      aria-hidden={stage === "initials" ? undefined : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${stage}:${src}`}
          src={src}
          alt={resolvedAlt}
          width={fill ? undefined : size}
          height={fill ? undefined : size}
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => {
            setStage((prev) => {
              if (prev === "uploaded") return "generated";
              if (prev === "generated") return "initials";
              return prev;
            });
          }}
        />
      ) : (
        <span
          className="select-none font-bold leading-none"
          style={fontSize ? { fontSize } : undefined}
          aria-label={resolvedAlt}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
