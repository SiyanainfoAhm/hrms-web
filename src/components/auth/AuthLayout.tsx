"use client";

import Image from "next/image";
import { cn } from "../../lib/cn";
import { appConfig } from "../../config/appConfig";

export function AuthLayout({
  title,
  subtitle,
  children,
  variant = "login",
  branding = appConfig,
  illustrationUrl
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: "login" | "signup" | "neutral";
  branding?: typeof appConfig;
  illustrationUrl?: string;
}) {
  const bg =
    variant === "login"
      ? "bg-gradient-to-br from-teal-400 to-blue-500"
      : variant === "signup"
        ? "bg-gradient-to-b from-purple-200 to-teal-200"
        : "bg-[var(--bg)]";

  return (
    <div className={cn("min-h-screen flex items-center justify-center p-6", bg)}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 animate-fade-in">
        {illustrationUrl && (
          <div className="relative h-44 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Image
                src={illustrationUrl}
                alt=""
                width={800}
                height={400}
                className="w-full h-full object-cover opacity-90"
                priority
              />
            </div>
          </div>
        )}

        <div className="p-8 flex flex-col items-center">
          <div className="mb-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-400 to-purple-500 flex items-center justify-center mb-3">
              <span className="text-white font-bold text-xl">{branding.logoText ?? branding.appShortName.slice(0, 1)}</span>
            </div>
            <h1 className="text-2xl font-bold text-center">{title}</h1>
            {subtitle && <p className="text-center text-gray-500 mt-1">{subtitle}</p>}
          </div>

          <div className="w-full">{children}</div>

          <div className="flex justify-center gap-4 mt-6 text-xs text-gray-400">
            <a href="#" className="hover:underline">
              Privacy
            </a>
            <span>·</span>
            <a href="#" className="hover:underline">
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

