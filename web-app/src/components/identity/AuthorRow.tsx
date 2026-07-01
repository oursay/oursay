"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import type { PillDisplayMode, SignTier, VerificationTier } from "@/lib/types";
import { AuthorBadgeGroup } from "./AuthorBadgeGroup";

interface AuthorRowProps {
  author: string;
  handle?: string;
  tier: VerificationTier;
  signTier?: SignTier;
  isHomeAuthor?: boolean;
  signedMode?: PillDisplayMode;
  kycMode?: PillDisplayMode;
  /** Relative time label (comment layout renders it inline after the name). */
  timestamp?: string;
  /** card = feed/post author block; comment = "Name • time" with right-aligned pill. */
  layout?: "card" | "comment";
  /** Row-2 right slot for card layout (jurisdiction / district scope tag). */
  scopeSlot?: ReactNode;
  /** Full-width continuation when a multi-district scope tag is expanded. */
  scopeContinuationSlot?: ReactNode;
  onAuthorClick?: () => void;
}

/**
 * Author identity row. Badge group [Signed][KYC] is right-justified (§2.4).
 */
export function AuthorRow({
  author,
  handle,
  tier,
  signTier,
  isHomeAuthor = false,
  signedMode = "icon",
  kycMode = "full",
  timestamp,
  layout = "card",
  scopeSlot,
  scopeContinuationSlot,
  onAuthorClick,
}: AuthorRowProps) {
  const isComment = layout === "comment";
  const badges = (
    <AuthorBadgeGroup
      signTier={signTier}
      tier={tier}
      isHomeAuthor={isHomeAuthor}
      signedMode={signedMode}
      kycMode={kycMode}
      align="right"
    />
  );

  if (!isComment) {
    return (
      <div>
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
              {badges}
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
        {scopeContinuationSlot ? (
          <div className="w-full">{scopeContinuationSlot}</div>
        ) : null}
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
        <Avatar name={author} size="sm" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{author}</span>
            {timestamp ? (
              <span className="shrink-0 text-xs text-muted">• {timestamp}</span>
            ) : null}
          </span>
        </span>
      </button>
      {badges}
    </div>
  );
}
