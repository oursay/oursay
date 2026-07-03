"use client";

import { useEffect, useRef, useState } from "react";
import { AnonymityDropdown } from "@/components/identity";
import { Button } from "@/components/ui";
import type { AuthorVisibility } from "@/lib/types";

interface ReplyComposerProps {
  /** Account-default visibility — the composer's starting anonymity. */
  accountVisibility: AuthorVisibility;
  /** Prefilled text (e.g. a leading @handle mention at max depth). */
  initialText?: string;
  autoFocus?: boolean;
  onCancel: () => void;
  onSubmit: (text: string, visibility: AuthorVisibility) => void;
}

/**
 * Inline reply editor rendered in place under a comment (or the post). Holds its
 * own text + anonymity state so several composers can be open simultaneously.
 */
export function ReplyComposer({
  accountVisibility,
  initialText = "",
  autoFocus = false,
  onCancel,
  onSubmit,
}: ReplyComposerProps) {
  const [text, setText] = useState(initialText);
  const [visibility, setVisibility] = useState<AuthorVisibility>(accountVisibility);
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
        <AnonymityDropdown
          size="compact"
          value={visibility}
          onChange={setVisibility}
        />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="rounded-full!"
          onClick={() => onSubmit(text, visibility)}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
