import Image from "next/image";
import { cn } from "../../lib/cn";
import { appConfig, type AppBranding } from "../../config/appConfig";

const DEFAULT_LOGO = "/branding/hrms-agent.png";

export type BrandVariant = "login" | "signup" | "neutral" | "landing";

function brandGradient(variant: BrandVariant) {
  switch (variant) {
    case "signup":
      return "from-violet-800 via-violet-600 to-cyan-600";
    case "login":
    case "landing":
      return "from-violet-800 via-violet-600 to-teal-600";
    default:
      return "from-slate-900 via-violet-800 to-violet-950";
  }
}

export function BrandedMarketingAside({
  variant = "landing",
  branding = appConfig
}: {
  variant?: BrandVariant;
  branding?: AppBranding;
}) {
  const logoSrc = branding.logoUrl ?? DEFAULT_LOGO;
  const tagline = branding.tagline ?? "Human resources management, simplified.";
  const isRemoteLogo = logoSrc.startsWith("http://") || logoSrc.startsWith("https://");

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col justify-center overflow-hidden px-8 py-10 sm:px-12",
        "min-h-[220px] lg:min-h-screen lg:w-[min(44vw,520px)] lg:flex-none xl:w-[min(40vw,560px)]"
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", brandGradient(variant))} />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 sm:h-72 sm:w-72" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-48 w-48 rounded-full bg-white/5 sm:h-56 sm:w-56" />
      <div className="pointer-events-none absolute right-1/4 top-1/3 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl" />

      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center text-center lg:mx-0 lg:items-start lg:text-left">
        <div className="mb-5 flex justify-center lg:justify-start">
          <div className="rounded-2xl bg-white/15 p-3 shadow-lg ring-1 ring-white/25 backdrop-blur-sm">
            <Image
              src={logoSrc}
              alt={`${branding.appShortName} logo`}
              width={112}
              height={112}
              className="h-[4.5rem] w-[4.5rem] rounded-xl object-cover sm:h-24 sm:w-24"
              priority
              unoptimized={isRemoteLogo}
            />
          </div>
        </div>
        <h2 className="text-balance text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{branding.appName}</h2>
        <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-white/90 sm:text-base">{tagline}</p>
      </div>
    </aside>
  );
}
