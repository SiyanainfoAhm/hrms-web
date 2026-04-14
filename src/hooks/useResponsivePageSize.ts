"use client";

import { useEffect, useState } from "react";

/**
 * Matches data-fetch page sizes to viewport: fewer rows on small screens (less scroll),
 * more on desktop. Used with API `page` + `pageSize` (Supabase range).
 *
 * - lg+ (1024px): 20 — laptop / desktop
 * - md (768–1023px): 15 — tablet
 * - below md: 10 — phone
 */
export function useResponsivePageSize() {
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const mqDesktop = window.matchMedia("(min-width: 1024px)");
    const mqTablet = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (mqDesktop.matches) setPageSize(20);
      else if (mqTablet.matches) setPageSize(15);
      else setPageSize(10);
    };
    sync();
    mqDesktop.addEventListener("change", sync);
    mqTablet.addEventListener("change", sync);
    return () => {
      mqDesktop.removeEventListener("change", sync);
      mqTablet.removeEventListener("change", sync);
    };
  }, []);

  return pageSize;
}
