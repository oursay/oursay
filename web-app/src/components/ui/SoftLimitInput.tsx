"use client";

import type { ChangeEvent } from "react";
import { CharLimitCounter } from "./CharLimitCounter";
import { clampTypedValue } from "@/lib/content-limits";

interface SoftLimitInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Plain text input with soft character limits: typing is blocked past max;
 * paste may exceed. Shows the shared bottom-right counter (no native maxLength).
 */
export function SoftLimitInput({
  value,
  onChange,
  maxLength,
  placeholder,
  className = "",
  "aria-label": ariaLabel,
}: SoftLimitInputProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onChange(clampTypedValue(value, e.target.value, maxLength));
        }}
        className={`w-full rounded-lg border border-border bg-surface-muted px-3 py-2 pr-14 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none ${className}`}
      />
      <CharLimitCounter length={value.length} max={maxLength} />
    </div>
  );
}
