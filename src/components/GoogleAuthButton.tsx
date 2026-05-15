"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { GoogleLogo } from "@/components/GoogleLogo";
import { cn } from "@/lib/cn";

declare global {
  interface Window {
    google?: any;
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
}

export function GoogleAuthButton(props: {
  label?: string;
  onSuccessRedirect?: string;
  mode?: "login" | "signup";
  /** When false, omits the leading "or" row (parent usually renders OrDivider above this button). */
  showOrDivider?: boolean;
  onAuthStart?: () => void;
  onPrefill?: (data: { email: string; name?: string }) => void;
  /** Required for signup: company name from the form above the button. */
  getCompanyName?: () => string;
}) {
  const label = props.label ?? "Continue with Google";
  const redirectTo = props.onSuccessRedirect ?? "/app/dashboard";
  const mode = props.mode ?? "login";
  const showOrDivider = props.showOrDivider !== false;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const reactId = useId();
  const containerId = `google-btn-${reactId}`;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const renderedRef = useRef(false);
  const onPrefillRef = useRef(props.onPrefill);
  const onAuthStartRef = useRef(props.onAuthStart);
  const getCompanyNameRef = useRef(props.getCompanyName);

  useEffect(() => {
    onPrefillRef.current = props.onPrefill;
  }, [props.onPrefill]);

  useEffect(() => {
    onAuthStartRef.current = props.onAuthStart;
  }, [props.onAuthStart]);

  useEffect(() => {
    getCompanyNameRef.current = props.getCompanyName;
  }, [props.getCompanyName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clientId) return;
      try {
        await loadGoogleScript();
        if (cancelled) return;
        if (!window.google?.accounts?.id) return;
        if (renderedRef.current) return;
        renderedRef.current = true;

        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          callback: async (resp: { credential?: string }) => {
            const token = resp?.credential;
            if (!token) {
              setError("Google sign-in failed");
              return;
            }
            onAuthStartRef.current?.();
            setLoading(true);
            setError(null);
            try {
              const companyName =
                mode === "signup" ? (getCompanyNameRef.current?.() ?? "").trim() : "";
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  idToken: token,
                  mode,
                  ...(mode === "signup" && companyName ? { companyName } : {}),
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data?.error || "Google sign-in failed");
              const u = data?.user;
              if (u?.email && onPrefillRef.current) {
                onPrefillRef.current({
                  email: String(u.email),
                  name: typeof u?.name === "string" ? u.name : undefined,
                });
              }
              if (u?.id && u?.email) {
                try {
                  localStorage.setItem(
                    "demoUser",
                    JSON.stringify({
                      id: String(u.id),
                      email: String(u.email),
                      fullName:
                        typeof u?.name === "string" && u.name.trim()
                          ? u.name.trim()
                          : String(u.email).split("@")[0] || "User",
                      role: typeof u?.role === "string" ? u.role : "employee",
                    }),
                  );
                } catch {
                  /* ignore quota / private mode */
                }
              }
              window.location.href = redirectTo;
            } catch (e: any) {
              setError(e?.message || "Google sign-in failed");
            } finally {
              setLoading(false);
            }
          },
        });

        const host = document.getElementById(containerId);
        if (host) {
          window.google.accounts.id.renderButton(host, {
            theme: "outline",
            size: "large",
            width: 360,
            text: "continue_with",
            shape: "rectangular",
          });
        }
        if (!cancelled) setGsiReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load Google sign-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, containerId, redirectTo, mode]);

  const triggerGoogle = useCallback(() => {
    if (loading) return;
    if (mode === "signup") {
      const co = (getCompanyNameRef.current?.() ?? "").trim();
      if (!co) {
        setError("Company name is required before signing up with Google.");
        return;
      }
    }
    setError(null);
    onAuthStartRef.current?.();
    const host = document.getElementById(containerId);
    const inner = host?.querySelector('[role="button"]') as HTMLElement | null;
    if (inner) {
      inner.click();
      return;
    }
    if (window.google?.accounts?.id?.prompt) {
      window.google.accounts.id.prompt();
      return;
    }
    setError("Google sign-in is still loading. Try again in a moment.");
  }, [containerId, loading, mode]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-2">
      {showOrDivider && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-500">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      )}
      <button
        type="button"
        onClick={triggerGoogle}
        disabled={loading || !gsiReady}
        className={cn(
          "w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition shadow-sm",
          "disabled:opacity-60 disabled:pointer-events-none",
        )}
        aria-label={label}
      >
        <GoogleLogo />
        <span className="text-gray-800 font-semibold text-sm">
          {loading ? "Please wait…" : label}
        </span>
      </button>
      <div
        id={containerId}
        className="sr-only absolute h-0 w-0 overflow-hidden opacity-0 pointer-events-none"
        aria-hidden
      />
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
