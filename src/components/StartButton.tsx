"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { authConfig } from "../config/authConfig";
import { getRoleHomeHref } from "../config/roleHomeConfig";
import { getDemoUserFromStorage } from "../lib/demoAuth";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

export function StartButton({ className, children }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const label = useMemo(() => {
    return children ?? "Start";
  }, [children]);

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={() => {
        setLoading(true);
        try {
          const u = getDemoUserFromStorage();
          if (!u) {
            router.push(authConfig.endpoints.login);
            return;
          }
          router.push(getRoleHomeHref(u.role));
        } finally {
          setLoading(false);
        }
      }}
    >
      {label}
    </button>
  );
}

