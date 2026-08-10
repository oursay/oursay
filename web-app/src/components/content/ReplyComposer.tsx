"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MentionComposer } from "./MentionComposer";
import type { MentionRoster } from "@/lib/mentions/compose";
import { emptyMentionRoster } from "@/lib/mentions/roster";
import { resolveComposeMentions } from "@/lib/mentions/compose";
import type { MentionCandidate } from "@oursay/identity";

export interface MentionSubmitPayload {
  text: string;
  mentions: MentionCandidate[];
  mentionSpans: string[];
}

interface ReplyComposerProps {
  /** Prefilled text (e.g. a leading @handle mention at max depth). */
  initialText?: string;
  autoFocus?: boolean;
  /** Soft character cap for the reply body. */
  maxLength?: number;
  /** In-thread roster for @ typeahead; empty ⇒ unmatched @ → Someone. */
  roster?: MentionRoster;
  /** Fires on every text change (for localStorage draft persistence). */
  onTextChange?: (text: string) => void;
  onCancel: () => void;
  onSubmit: (payload: MentionSubmitPayload) => void;
}

/**
 * Inline reply editor rendered in place under a comment. Anonymity is set once
 * per thread (beside the thread-root header), so the composer only owns text.
 */
export function ReplyComposer({
  initialText = "",
  autoFocus = false,
  maxLength,
  roster = emptyMentionRoster(),
  onTextChange,
  onCancel,
  onSubmit,
}: ReplyComposerProps) {
  const [text, setText] = useState(initialText);
  const mounted = useRef(false);
  const overLimit = maxLength != null && text.length > maxLength;

  // On open, place the caret after the prefilled "@handle " mention.
  useEffect(() => {
    if (!autoFocus || mounted.current) return;
    mounted.current = true;
  }, [autoFocus]);

  const updateText = (next: string) => {
    setText(next);
    onTextChange?.(next);
  };

  const submit = () => {
    if (overLimit) return;
    const resolved = resolveComposeMentions(text, roster);
    if (!resolved.text.trim()) return;
    onSubmit(resolved);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <MentionComposer
        value={text}
        onChange={updateText}
        roster={roster}
        autoFocus={autoFocus}
        rows={3}
        placeholder="Write a reply…"
        maxLength={maxLength}
        onSubmitHotkey={submit}
      />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="rounded-full!"
          onClick={submit}
          disabled={overLimit}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
