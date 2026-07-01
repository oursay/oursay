"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

interface CheckboxRowProps {
  label: string;
  checked?: boolean;
  /** Show the checkbox control (jurisdiction rows hide it when only one exists). */
  showCheckbox?: boolean;
  /** Toggle the checkbox specifically (distinct from tapping the row name). */
  onToggle?: () => void;
  /** Tap the row/name — the wireframe's "isolate to only this" action. */
  onSelect?: () => void;
  icon?: ReactNode;
  /** Trailing content: a value label (Verified ladder) or an action affordance. */
  trailing?: ReactNode;
  disabled?: boolean;
}

/** A filter / selector row: optional checkbox + icon + label + trailing slot. */
export function CheckboxRow({
  label,
  checked = false,
  showCheckbox = true,
  onToggle,
  onSelect,
  icon,
  trailing,
  disabled = false,
}: CheckboxRowProps) {
  return (
    <div
      className={`flex min-h-11 items-center gap-3 rounded-lg px-2 ${disabled ? "opacity-50" : "hover:bg-surface-muted"}`}
    >
      {showCheckbox ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={onToggle}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded border ${checked ? "border-ink bg-ink text-white" : "border-border-strong bg-surface"}`}
        >
          {checked ? <Check size={14} aria-hidden /> : null}
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled || !onSelect}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        {icon ? <span className="shrink-0 text-ink-soft">{icon}</span> : null}
        <span className="truncate text-sm text-ink">{label}</span>
      </button>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
