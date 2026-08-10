"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MentionRoster, MentionRosterEntry } from "@/lib/mentions/compose";
import {
  activeMentionQuery,
  applyMentionSelection,
  composeHighlightSegments,
  filterMentionRoster,
} from "@/lib/mentions/compose";
import {
  getCaretPlainOffset,
  serializeComposeEditor,
  setCaretPlainOffset,
} from "@/lib/mentions/compose-editor-dom";
import { CharLimitCounter } from "@/components/ui/CharLimitCounter";

interface MentionComposerProps {
  value: string;
  onChange: (value: string) => void;
  roster: MentionRoster;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  /** Soft character cap — block typing past; allow paste over. */
  maxLength?: number;
  /** Called when Enter should submit (Ctrl/Cmd+Enter). */
  onSubmitHotkey?: () => void;
}

const FIELD_PAD =
  "box-border w-full px-2.5 py-2 text-sm leading-5 whitespace-pre-wrap break-words";

const TAG_CLASS = "font-bold text-brand-700";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML for the contenteditable — mention tags are bold in the same DOM as typed text. */
export function renderComposeHtml(text: string, roster: MentionRoster): string {
  if (!text) return "";
  return composeHighlightSegments(text, roster)
    .map((seg) => {
      const esc = escapeHtml(seg.value).replace(/\n/g, "<br>");
      if (seg.type === "tag") {
        return `<span class="${TAG_CLASS}" data-mention="1">${esc}</span>`;
      }
      return esc;
    })
    .join("");
}

function tagLayoutKey(text: string, roster: MentionRoster): string {
  return composeHighlightSegments(text, roster)
    .map((s) => (s.type === "tag" ? `T:${s.value}` : `x:${s.value.length}`))
    .join("|");
}

function selectedPlainLength(): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return 0;
  return sel.toString().length;
}

/**
 * Contenteditable composer with `@` typeahead.
 * Resolved tags are bold purple in the live DOM (not an overlay) so the caret
 * stays aligned when typing after a mention.
 */
export function MentionComposer({
  value,
  onChange,
  roster,
  placeholder,
  rows = 3,
  autoFocus = false,
  className,
  maxLength,
  onSubmitHotkey,
}: MentionComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const paintedKey = useRef<string>("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);

  const active = useMemo(() => activeMentionQuery(value, caret), [value, caret]);
  const suggestions = useMemo(
    () => (active ? filterMentionRoster(roster, active.query) : []),
    [active, roster],
  );

  const paint = (text: string, nextCaret?: number) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = renderComposeHtml(text, roster);
    paintedKey.current = tagLayoutKey(text, roster);
    if (nextCaret !== undefined) setCaretPlainOffset(el, nextCaret);
  };

  // Sync from controlled value when it diverges (typeahead pick, parent reset, roster change).
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = serializeComposeEditor(el);
    const key = tagLayoutKey(value, roster);
    if (current === value && paintedKey.current === key) return;
    const restore =
      document.activeElement === el ? getCaretPlainOffset(el) : undefined;
    paint(value, restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint closes over roster
  }, [value, roster]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    setCaretPlainOffset(el, serializeComposeEditor(el).length);
  }, [autoFocus]);

  const emitFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const offset = getCaretPlainOffset(el);
    const plain = serializeComposeEditor(el);
    setCaret(offset);
    setHighlight(0);
    onChange(plain);
    const key = tagLayoutKey(plain, roster);
    // Only rebuild DOM when tag boundaries change — keeps caret native otherwise.
    if (key !== paintedKey.current) {
      paint(plain, offset);
    }
  };

  const pick = (entry: MentionRosterEntry) => {
    const next = applyMentionSelection(value, caret, entry);
    if (
      maxLength != null &&
      next.text.length > maxLength &&
      value.length <= maxLength
    ) {
      // Completing a mention that would push past the soft cap — block (like overtyping).
      return;
    }
    onChange(next.text);
    setCaret(next.caret);
    setHighlight(0);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      paint(next.text, next.caret);
      el.focus();
    });
  };

  const shellClass =
    className ?? "rounded-md border border-border bg-surface-muted";

  const overLimit = maxLength != null && value.length > maxLength;

  return (
    <div className="relative">
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={`${shellClass} ${FIELD_PAD} text-ink outline-none empty:before:pointer-events-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] ${maxLength != null ? "pb-6" : ""}`}
        style={{ minHeight: `${rows * 1.25}rem` }}
        onInput={emitFromEditor}
        onBeforeInput={(e) => {
          if (maxLength == null) return;
          const ie = e.nativeEvent as InputEvent;
          const inputType = ie.inputType ?? "";
          if (
            inputType === "insertFromPaste" ||
            inputType === "insertFromDrop" ||
            inputType.startsWith("delete") ||
            inputType === "historyUndo" ||
            inputType === "historyRedo"
          ) {
            return;
          }
          const el = editorRef.current;
          if (!el) return;
          const plain = serializeComposeEditor(el);
          let insertLen = ie.data?.length ?? 0;
          if (
            insertLen === 0 &&
            (inputType === "insertParagraph" || inputType === "insertLineBreak")
          ) {
            insertLen = 1;
          }
          if (insertLen === 0 && !inputType.startsWith("insert")) return;
          const replaceLen = selectedPlainLength();
          const nextLen = plain.length - replaceLen + insertLen;
          if (nextLen > maxLength) e.preventDefault();
        }}
        onKeyUp={() => {
          const el = editorRef.current;
          if (el) setCaret(getCaretPlainOffset(el));
        }}
        onClick={() => {
          const el = editorRef.current;
          if (el) setCaret(getCaretPlainOffset(el));
        }}
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
              return;
            }
          }
          if (onSubmitHotkey && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            if (overLimit) return;
            e.preventDefault();
            onSubmitHotkey();
          }
        }}
      />
      {maxLength != null ? (
        <CharLimitCounter length={value.length} max={maxLength} />
      ) : null}
      {suggestions.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-md"
          role="listbox"
        >
          {suggestions.map((entry, i) => {
            const alias =
              entry.aliases?.find((a) => a.toLowerCase() !== entry.display.toLowerCase()) ??
              null;
            return (
              <li key={`${entry.candidate.kind}:${entry.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  className={
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm " +
                    (i === highlight
                      ? "bg-surface-muted text-ink"
                      : "text-ink-soft hover:bg-surface-muted")
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(entry);
                  }}
                >
                  <span className="font-bold text-brand-700">@{entry.display}</span>
                  {alias ? <span className="truncate text-xs text-muted">{alias}</span> : null}
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {entry.candidate.kind === "persona" ? "persona" : "profile"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
