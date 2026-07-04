"use client";

import { EyeOff, MessageSquare } from "lucide-react";
import { formatCount } from "@/components/utils";

interface CommentPillProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

/** Compact comment-count capsule — shared by feed cards and record footers. */
export function CommentPill({ count, onClick, className = "" }: CommentPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`pill-chrome inline-flex h-5 items-center gap-1 rounded-full bg-surface px-2 text-xs text-ink-soft hover:bg-surface-muted disabled:cursor-default ${className}`}
    >
      <MessageSquare size={11} aria-hidden />
      {formatCount(count)}
    </button>
  );
}

interface CommentCountPillProps {
  /** Comments currently shown in the thread. */
  count: number;
  /** Comments hidden by active filters — adds an eye-off split segment. */
  hidden?: number;
  className?: string;
}

/**
 * Static comment-count capsule for the thread header. Same chrome as the card
 * CommentPill but informational, not a control — it already sits at the
 * comments section, so there's nothing to jump to. When filters hide replies
 * it splits (like the reaction capsule) into an eye-off segment for the count.
 */
export function CommentCountPill({
  count,
  hidden = 0,
  className = "",
}: CommentCountPillProps) {
  return (
    <span
      className={`pill-chrome inline-flex h-5 items-center overflow-hidden rounded-full bg-surface text-xs text-ink-soft ${className}`}
    >
      <span className="inline-flex items-center gap-1 px-2">
        <MessageSquare size={11} aria-hidden />
        {formatCount(count)}
      </span>
      {hidden > 0 ? (
        <>
          <span className="w-px shrink-0 self-stretch bg-ink" aria-hidden />
          <span
            className="inline-flex items-center gap-1 px-2"
            title={`${hidden} hidden by filters`}
          >
            <EyeOff size={11} aria-hidden />
            {formatCount(hidden)}
          </span>
        </>
      ) : null}
    </span>
  );
}
