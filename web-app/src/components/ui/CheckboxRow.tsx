"use client";

import type { ReactNode } from "react";
import { CheckboxIndicator } from "./CheckboxIndicator";

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
  /**
   * Trailing content: a value label (Verified ladder / geography mode). Lives
   * inside the row button so the whole row triggers onSelect — must be
   * non-interactive.
   */
  trailing?: ReactNode;
  disabled?: boolean;
  /** When false, the label row hugs its content (jurisdiction dropdown). */
  fill?: boolean;
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
  fill = true,
}: CheckboxRowProps) {
  return (
    <div
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2 ${disabled ? "opacity-50" : "hover:bg-surface-muted"}`}
    >
      {showCheckbox ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={onToggle}
          className="inline-flex size-5 shrink-0 items-center justify-center"
        >
          <CheckboxIndicator checked={checked} />
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled || !onSelect}
        onClick={onSelect}
        className={`flex min-w-0 items-center gap-2 self-stretch text-left disabled:cursor-default ${fill || trailing ? "flex-1" : ""}`}
      >
        {icon ? <span className="shrink-0 text-ink-soft">{icon}</span> : null}
        <span className="truncate text-sm text-ink">{label}</span>
        {trailing ? (
          <span className="ml-auto flex shrink-0 items-center pl-2">
            {trailing}
          </span>
        ) : null}
      </button>
    </div>
  );
}
