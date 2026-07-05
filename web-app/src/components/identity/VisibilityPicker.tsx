"use client";

import { Check, Lock } from "lucide-react";
import type { AuthorVisibility } from "@/lib/types";
import {
  VISIBILITY_DESCRIPTION,
  VISIBILITY_LABEL,
  VISIBILITY_VALUES,
} from "@/lib/types";
import { VISIBILITY_NARROWNESS } from "@/lib/read-model";

interface VisibilityPickerProps {
  value: AuthorVisibility;
  onChange: (v: AuthorVisibility) => void;
  /**
   * Narrow-only floor (docs/09 §2): options WIDER than this are disabled —
   * a thread override can hide you further, never expose you more.
   */
  minVisibility?: AuthorVisibility;
  /** Hint shown on disabled (wider-than-floor) rows. */
  disabledHint?: string;
}

/** Radio list over the profile-visibility ladder, widest audience first. */
export function VisibilityPicker({
  value,
  onChange,
  minVisibility,
  disabledHint = "Can't be wider than your account default",
}: VisibilityPickerProps) {
  const floor = minVisibility ? VISIBILITY_NARROWNESS[minVisibility] : 0;

  return (
    <div role="radiogroup" aria-label="Who can see your profile" className="space-y-1.5">
      {VISIBILITY_VALUES.map((v) => {
        const disabled = VISIBILITY_NARROWNESS[v] < floor;
        const selected = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            onClick={() => onChange(v)}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left ${
              selected
                ? "border-brand-600 bg-brand-50"
                : disabled
                  ? "cursor-not-allowed border-border bg-surface-muted opacity-60"
                  : "border-border bg-surface hover:bg-surface-muted"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">
                {VISIBILITY_LABEL[v]}
              </span>
              <span className="block truncate text-xs text-muted">
                {disabled ? disabledHint : VISIBILITY_DESCRIPTION[v]}
              </span>
            </span>
            {selected ? (
              <Check size={16} className="shrink-0 text-brand-700" aria-hidden />
            ) : disabled ? (
              <Lock size={14} className="shrink-0 text-muted" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
