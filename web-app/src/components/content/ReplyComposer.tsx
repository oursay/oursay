"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface ReplyComposerProps {
  /** Prefilled text (e.g. a leading @handle mention at max depth). */
  initialText?: string;
  autoFocus?: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}

/**
 * Inline reply editor rendered in place under a comment. Anonymity is set once
 * per thread (beside the thread-root header), so the composer only owns text.
 */
export function ReplyComposer({
  initialText = "",
  autoFocus = false,
  onCancel,
  onSubmit,
}: ReplyComposerProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // On open, place the caret after the prefilled "@handle " mention.
  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [autoFocus]);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <textarea
        ref={textareaRef}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
      />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="rounded-full!"
          onClick={() => onSubmit(text)}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
