"use client";

import { useMemo, useRef, useState } from "react";
import type { MentionRoster, MentionRosterEntry } from "@/lib/mentions/compose";
import {
  activeMentionQuery,
  applyMentionSelection,
  filterMentionRoster,
} from "@/lib/mentions/compose";

interface MentionComposerProps {
  value: string;
  onChange: (value: string) => void;
  roster: MentionRoster;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  /** Called when Enter should submit (Ctrl/Cmd+Enter). */
  onSubmitHotkey?: () => void;
}

/**
 * Textarea with `@` typeahead against an in-thread roster.
 * Finalize unresolved spans to `@Someone` at submit via `resolveComposeMentions`.
 */
export function MentionComposer({
  value,
  onChange,
  roster,
  placeholder,
  rows = 3,
  autoFocus = false,
  className =
    "w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted",
  onSubmitHotkey,
}: MentionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);

  const active = useMemo(() => activeMentionQuery(value, caret), [value, caret]);
  const suggestions = useMemo(
    () => (active ? filterMentionRoster(roster, active.query) : []),
    [active, roster],
  );

  const pick = (entry: MentionRosterEntry) => {
    const next = applyMentionSelection(value, caret, entry);
    onChange(next.text);
    setCaret(next.caret);
    setHighlight(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setHighlight(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const entry = suggestions[highlight] ?? suggestions[0];
              if (entry) pick(entry);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setHighlight(0);
              // Move caret past query so typeahead closes without inserting.
              const el = textareaRef.current;
              if (el && active) {
                const end = caret;
                el.setSelectionRange(end, end);
              }
              return;
            }
          }
          if (onSubmitHotkey && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmitHotkey();
          }
        }}
      />
      {suggestions.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-md"
          role="listbox"
        >
          {suggestions.map((entry, i) => (
            <li key={`${entry.candidate.kind}:${entry.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm " +
                  (i === highlight ? "bg-surface-muted text-ink" : "text-ink-soft hover:bg-surface-muted")
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(entry);
                }}
              >
                <span className="font-semibold text-brand-700">@{entry.display}</span>
                <span className="text-xs text-muted">
                  {entry.candidate.kind === "persona" ? "persona" : "profile"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
