"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type InteractiveAvatarProps = {
  src: string;
  alt: string;
  /** Avatar diameter in px — matches existing dashboard h-20 (80px) by default. */
  size?: number;
  className?: string;
  /** Play a one-shot wave when the pointer enters (desktop hover devices only). */
  waveOnHover?: boolean;
  /** Play a one-shot wave shortly after mount (once per mount). */
  initialGreeting?: boolean;
};

type IdleVariant = "tilt" | "lift" | "scale" | null;

function AvatarHand({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 50C5 42 7 30 13 20L17 9C19 5 24 5 26 10L23 27C21 37 24 46 20 53Z"
        fill="#6d28d9"
      />
      <path
        d="M8 50C5 42 7 30 13 20L17 9C19 5 24 5 26 10L23 27C21 37 24 46 20 53Z"
        stroke="#5b21b6"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <ellipse cx="19" cy="44" rx="5.5" ry="4.5" fill="#f0b88a" />
      <path
        d="M13 42C17 38 27 38 31 42L33 47C31 53 22 53 16 49Z"
        fill="#f0b88a"
        stroke="#d4956a"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <path
        d="M14 44C11 41 10 37 13 35"
        stroke="#f0b88a"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d="M27 39L30 31" stroke="#f0b88a" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M29 40L33 30" stroke="#f0b88a" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M31 41L36 32" stroke="#f0b88a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M33 43L38 35" stroke="#f0b88a" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M27 39L30 31M29 40L33 30M31 41L36 32M33 43L38 35"
        stroke="#d4956a"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function InteractiveAvatar({
  src,
  alt,
  size = 80,
  className,
  waveOnHover = false,
  initialGreeting = false,
}: InteractiveAvatarProps) {
  const handId = useId();
  const [isInteracting, setIsInteracting] = useState(false);
  const [waveKey, setWaveKey] = useState(0);
  const [idleVariant, setIdleVariant] = useState<IdleVariant>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canHover, setCanHover] = useState(false);

  const isWavingRef = useRef(false);
  const hasGreetedRef = useRef(false);
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instanceOffsetRef = useRef(Math.random() * 3000);

  const clearTimer = (ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current !== null) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const startWave = useCallback(() => {
    if (reducedMotion || isWavingRef.current) return;
    isWavingRef.current = true;
    setIsInteracting(true);
    setWaveKey((k) => k + 1);
  }, [reducedMotion]);

  const handleWaveEnd = useCallback((event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== "avatar-hand-emerge") return;
    isWavingRef.current = false;
    setIsInteracting(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!waveOnHover || !canHover || reducedMotion) return;
    if (isWavingRef.current) return;
    startWave();
  }, [waveOnHover, canHover, reducedMotion, startWave]);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hoverMq = window.matchMedia("(hover: hover)");

    const syncMotion = () => setReducedMotion(motionMq.matches);
    const syncHover = () => setCanHover(hoverMq.matches);

    syncMotion();
    syncHover();

    motionMq.addEventListener("change", syncMotion);
    hoverMq.addEventListener("change", syncHover);

    return () => {
      motionMq.removeEventListener("change", syncMotion);
      hoverMq.removeEventListener("change", syncHover);
    };
  }, []);

  useEffect(() => {
    if (!initialGreeting || reducedMotion || hasGreetedRef.current) return;

    clearTimer(greetingTimerRef);
    const delay = 700 + Math.random() * 500;
    greetingTimerRef.current = setTimeout(() => {
      if (!hasGreetedRef.current && !isWavingRef.current) {
        hasGreetedRef.current = true;
        startWave();
      }
    }, delay);

    return () => clearTimer(greetingTimerRef);
  }, [initialGreeting, reducedMotion, startWave]);

  useEffect(() => {
    if (reducedMotion) return;

    const scheduleIdle = () => {
      const delay = 8000 + Math.random() * 7000;
      idleTimerRef.current = setTimeout(() => {
        if (!isWavingRef.current) {
          const variants: Exclude<IdleVariant, null>[] = ["tilt", "lift", "scale"];
          const pick = variants[Math.floor(Math.random() * variants.length)];
          setIdleVariant(pick);
          idleResetTimerRef.current = setTimeout(() => setIdleVariant(null), 650);
        }
        scheduleIdle();
      }, delay);
    };

    const bootstrap = setTimeout(
      scheduleIdle,
      8000 + Math.random() * 7000 + (instanceOffsetRef.current % 4000),
    );

    return () => {
      clearTimeout(bootstrap);
      clearTimer(idleTimerRef);
      clearTimer(idleResetTimerRef);
    };
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      clearTimer(greetingTimerRef);
      clearTimer(idleTimerRef);
      clearTimer(idleResetTimerRef);
    };
  }, []);

  return (
    <div
      className={cn(
        "interactive-avatar",
        isInteracting && "is-interacting",
        idleVariant === "tilt" && "idle-tilt",
        idleVariant === "lift" && "idle-lift",
        idleVariant === "scale" && "idle-scale",
        className,
      )}
      style={{ "--avatar-size": `${size}px` } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
    >
      <div className="avatar-character">
        <div
          key={`${handId}-${waveKey}`}
          className={cn("avatar-hand-wrapper", isInteracting && "avatar-hand-wrapper--wave")}
          onAnimationEnd={handleWaveEnd}
        >
          <AvatarHand className="avatar-hand" />
        </div>
        <div className="avatar-circle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={size}
            height={size}
            className="h-full w-full rounded-full object-cover"
            crossOrigin="anonymous"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
