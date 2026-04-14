"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  /** Optional: used on signup screen to prefill form values. */
  onPrefill?: (data: { email: string; name?: string }) => void;
}) {
  const label = props.label ?? "Continue with Google";
  const redirectTo = props.onSuccessRedirect ?? "/app/dashboard";
  const mode = props.mode ?? "login";
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const reactId = useId();
  const containerId = `google-btn-${reactId}`;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const renderedRef = useRef(false);
  const onPrefillRef = useRef(props.onPrefill);

  useEffect(() => {
    onPrefillRef.current = props.onPrefill;
  }, [props.onPrefill]);

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
          callback: async (resp: { credential?: string }) => {
            const token = resp?.credential;
            if (!token) {
              setError("Google sign-in failed");
              return;
            }
            setLoading(true);
            setError(null);
            try {
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: token, mode }),
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
              window.location.href = redirectTo;
            } catch (e: any) {
              setError(e?.message || "Google sign-in failed");
            } finally {
              setLoading(false);
            }
          },
        });

        // Render the official button to avoid policy issues
        window.google.accounts.id.renderButton(document.getElementById(containerId), {
          theme: "outline",
          size: "large",
          width: 360,
          text: "continue_with",
          shape: "pill",
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load Google sign-in");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, containerId, redirectTo, mode]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-500">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="flex justify-center">
        <div className={loading ? "pointer-events-none opacity-70" : ""}>
          <div id={containerId} aria-label={label} />
        </div>
      </div>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}

