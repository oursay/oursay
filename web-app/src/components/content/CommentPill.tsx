"use client";

import { MessageSquare } from "lucide-react";
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
