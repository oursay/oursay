"use client";

import { CornerDownRight } from "lucide-react";

interface ReplyLinkProps {
  onClick?: () => void;
}

/** Inline reply affordance — same size everywhere (feed footer scale). */
export function ReplyLink({ onClick }: ReplyLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink-soft disabled:cursor-default"
    >
      <CornerDownRight size={11} aria-hidden />
      Reply
    </button>
  );
}
