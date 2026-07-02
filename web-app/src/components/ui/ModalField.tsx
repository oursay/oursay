"use client";

import { useState } from "react";

interface ModalFieldProps {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
  /** Live "n/max" counter inside the field (wireframe support-statement 17/60). */
  showCount?: boolean;
}

/** Labelled input styled like the wireframe compose/register fields. */
export function ModalField({
  label,
  placeholder,
  defaultValue,
  multiline = false,
  rows = 4,
  maxLength,
  hint,
  showCount = false,
}: ModalFieldProps) {
  const [length, setLength] = useState(defaultValue?.length ?? 0);
  const counted = showCount && maxLength !== undefined;

  const className = `w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none ${counted ? "pr-14" : ""}`;

  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
          {label}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          rows={rows}
          placeholder={placeholder}
          defaultValue={defaultValue}
          maxLength={maxLength}
          className={className}
        />
      ) : (
        <div className="relative">
          <input
            type="text"
            placeholder={placeholder}
            defaultValue={defaultValue}
            maxLength={maxLength}
            onChange={counted ? (e) => setLength(e.target.value.length) : undefined}
            className={className}
          />
          {counted ? (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
              {length}/{maxLength}
            </span>
          ) : null}
        </div>
      )}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </label>
  );
}
