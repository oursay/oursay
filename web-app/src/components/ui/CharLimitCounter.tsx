"use client";

import { charLimitTone } from "@/lib/content-limits";

interface CharLimitCounterProps {
  length: number;
  max: number;
  className?: string;
}

/**
 * Bottom-right `char/total` meter. Hidden until ~80%; at ≥95% only the max
 * side is danger-red; when over (paste), both sides are red.
 */
export function CharLimitCounter({
  length,
  max,
  className = "",
}: CharLimitCounterProps) {
  const tone = charLimitTone(length, max);
  if (tone === "hidden") return null;

  const countClass = tone === "over" ? "text-danger-700" : "text-muted";
  const slashClass = tone === "over" ? "text-danger-700" : "text-muted";
  const maxClass =
    tone === "near" || tone === "over" ? "text-danger-700" : "text-muted";

  return (
    <span
      className={`pointer-events-none absolute bottom-1.5 right-2 text-xs tabular-nums ${className}`}
      aria-live="polite"
    >
      <span className={countClass}>{length}</span>
      <span className={slashClass}>/</span>
      <span className={maxClass}>{max}</span>
    </span>
  );
}
