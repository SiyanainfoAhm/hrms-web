"use client";

import { useEffect, useMemo, useState } from "react";

function isIpadLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const platform = String((navigator as any).platform || "");

  // Classic iPad UA / platform.
  if (/\biPad\b/i.test(ua) || platform === "iPad") return true;

  // iPadOS 13+ may present as "MacIntel" / "Macintosh" while still being a touch device.
  if ((platform === "MacIntel" || ua.includes("Macintosh")) && (navigator.maxTouchPoints || 0) > 1) return true;

  return false;
}

function isProbablyIpadDesktopMode(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  // iPadOS (13+) often reports "Macintosh" but has touch points.
  return ua.includes("Macintosh") && (navigator.maxTouchPoints || 0) > 1;
}

function isCoarsePointerOrTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Coarse pointer generally means touch-first (phones/tablets).
    if (window.matchMedia?.("(pointer: coarse)").matches) return true;
    if (window.matchMedia?.("(hover: none)").matches && (navigator.maxTouchPoints || 0) > 0) return true;
  } catch {
    // ignore
  }
  return false;
}

export function DeviceGate({
  blocked,
  children,
}: {
  blocked: React.ReactNode;
  children: React.ReactNode;
}) {
  const [block, setBlock] = useState(false);

  const shouldBlock = useMemo(() => {
    // iPad (including iPad Pro / desktop mode): can appear as "desktop" width, but still tablet UX.
    if (isIpadLike() || isProbablyIpadDesktopMode()) return true;
    // Any coarse-pointer / touch-first device: treat as mobile/tablet.
    if (isCoarsePointerOrTouchPrimary()) return true;
    return false;
  }, []);

  useEffect(() => {
    setBlock(shouldBlock);
  }, [shouldBlock]);

  return <>{block ? blocked : children}</>;
}

