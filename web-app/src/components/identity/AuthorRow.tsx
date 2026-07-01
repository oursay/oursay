"use client";

import type { ReactNode } from "react";
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
  /** Row-2 right slot for card layout (jurisdiction / district scope tag). */
  scopeSlot?: ReactNode;
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
  scopeSlot,
  onAuthorClick,
}: AuthorRowProps) {
  const isComment = layout === "comment";

  if (!isComment) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAuthorClick}
          disabled={!onAuthorClick}
          className="shrink-0 self-start disabled:cursor-default"
        >
          <Avatar name={author} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={onAuthorClick}
              disabled={!onAuthorClick}
              className="min-w-0 truncate text-left text-sm font-semibold leading-tight text-ink disabled:cursor-default"
            >
              {author}
            </button>
            <VerificationPill tier={tier} isHomeAuthor={isHomeAuthor} align="right" />
          </div>
          <div className="-mt-px flex items-baseline justify-between gap-2">
            {handle ? (
              <button
                type="button"
                onClick={onAuthorClick}
                disabled={!onAuthorClick}
                className="min-w-0 truncate text-left text-xs text-muted disabled:cursor-default"
              >
                @{handle}
              </button>
            ) : timestamp ? (
              <span className="min-w-0 truncate text-xs text-muted">{timestamp}</span>
            ) : (
              <span aria-hidden />
            )}
            {scopeSlot ? <div className="shrink-0">{scopeSlot}</div> : null}
          </div>
        </div>
      </div>
    );
  }

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
