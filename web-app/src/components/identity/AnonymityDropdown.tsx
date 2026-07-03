"use client";

import { useState } from "react";
import { Check, ChevronDown, VenetianMask } from "lucide-react";
import type { AuthorVisibility } from "@/lib/types";
import { VISIBILITY_LABEL, VISIBILITY_VALUES } from "@/lib/types";
import { VISIBILITY_NARROWNESS } from "@/lib/read-model";

interface AnonymityDropdownProps {
  value: AuthorVisibility;
  onChange: (v: AuthorVisibility) => void;
  /** Narrow-only floor: options WIDER than this are disabled (docs/09 §2). */
  minVisibility?: AuthorVisibility;
  /** Uppercase field label above the control; omit for a bare inline button. */
  label?: string;
  /** Compact reply-bar sizing vs the compose field sizing. */
  size?: "field" | "compact";
  /** Menu edge the option list anchors to (and option text justification). */
  align?: "left" | "right";
}

/**
 * Inline visibility selector — mask icon + current label + chevron opening a
 * plain option list (no descriptions; the ProfileModal picker documents the
 * tiers). Used beside POSTING IN in the compose editor and on the reply bar.
 */
export function AnonymityDropdown({
  value,
  onChange,
  minVisibility,
  label,
  size = "field",
  align = "right",
}: AnonymityDropdownProps) {
  const [open, setOpen] = useState(false);
  const floor = minVisibility ? VISIBILITY_NARROWNESS[minVisibility] : 0;
  const compact = size === "compact";
  const alignRight = align === "right";

  return (
    <div className="relative min-w-0">
      {label ? (
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {label}
        </p>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label ?? "Anonymity"}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-1.5 rounded-lg border border-border bg-surface-muted text-ink hover:bg-surface ${
          compact
            ? "min-h-8 px-2 text-xs font-medium"
            : "mt-1 min-h-10 px-3 text-sm font-medium"
        }`}
      >
        <VenetianMask
          size={compact ? 14 : 18}
          className="shrink-0 text-ink-soft"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {VISIBILITY_LABEL[value]}
        </span>
        <ChevronDown
          size={compact ? 13 : 16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Anonymity"
          className={`absolute top-full z-10 mt-1 w-max min-w-28 overflow-hidden rounded-lg border border-border-strong bg-surface py-1 shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {VISIBILITY_VALUES.map((v) => {
            const disabled = VISIBILITY_NARROWNESS[v] < floor;
            const selected = v === value;
            return (
              <li key={v} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Can't be wider than your account default" : undefined}
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  className={`flex min-h-8 w-full items-center gap-2 px-3 text-sm ${
                    alignRight ? "text-right" : "text-left"
                  } ${
                    disabled
                      ? "cursor-not-allowed text-muted"
                      : "text-ink hover:bg-surface-muted"
                  }`}
                >
                  {selected && alignRight ? (
                    <Check size={14} className="shrink-0 text-ink" aria-hidden />
                  ) : null}
                  <span className="flex-1">{VISIBILITY_LABEL[v]}</span>
                  {selected && !alignRight ? (
                    <Check size={14} className="shrink-0 text-ink" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
