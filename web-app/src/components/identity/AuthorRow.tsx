"use client";

import { Avatar } from "@/components/ui";
import type { VerificationTier } from "@/lib/types";
import { VerificationPill } from "./VerificationPill";

interface AuthorRowProps {
  author: string;
  handle?: string;
  tier: VerificationTier;
  isHomeAuthor?: boolean;
  /** Relative time label (comment layout renders it inline after the name). */
  timestamp?: string;
  /** card = feed/post author block; comment = "Name • time" with right-aligned pill. */
  layout?: "card" | "comment";
  onAuthorClick?: () => void;
}

/**
 * Author identity row. The verification pill is always right-justified to the
 * row edge (§2.4). Card layout shows the @handle under the name; comment layout
 * drops the handle and reads "Name • time" inline.
 */
export function AuthorRow({
  author,
  handle,
  tier,
  isHomeAuthor = false,
  timestamp,
  layout = "card",
  onAuthorClick,
}: AuthorRowProps) {
  const isComment = layout === "comment";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onAuthorClick}
        disabled={!onAuthorClick}
        className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
      >
        <Avatar name={author} size={isComment ? "sm" : "md"} />
        <span className="min-w-0">
          {isComment ? (
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-semibold text-ink">
                {author}
              </span>
              {timestamp ? (
                <span className="shrink-0 text-xs text-muted">
                  • {timestamp}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="block">
              <span className="block truncate text-sm font-semibold text-ink">
                {author}
              </span>
              {handle ? (
                <span className="block truncate text-xs text-muted">
                  @{handle}
                </span>
              ) : timestamp ? (
                <span className="block truncate text-xs text-muted">
                  {timestamp}
                </span>
              ) : null}
            </span>
          )}
        </span>
      </button>
      <VerificationPill tier={tier} isHomeAuthor={isHomeAuthor} align="right" />
    </div>
  );
}
