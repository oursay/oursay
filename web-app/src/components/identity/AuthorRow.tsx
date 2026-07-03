"use client";

import type { ReactNode } from "react";
import { VenetianMask } from "lucide-react";
import { Avatar } from "@/components/ui";
import type {
  AuthorIdentity,
  PillDisplayMode,
  SignTier,
  VerificationTier,
} from "@/lib/types";
import { AuthorBadgeGroup } from "./AuthorBadgeGroup";
import type { AuthorGeoRelation } from "./VerificationPill";

interface AuthorRowProps {
  author: string;
  handle?: string;
  tier: VerificationTier;
  signTier?: SignTier;
  /** Residency author's spatial relation to the context. */
  authorGeo?: AuthorGeoRelation;
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
  /**
   * Viewer-resolved identity (API-served DTOs). Personas render the mask
   * glyph + "anonymous in this thread"; self rows hint the persona others see.
   */
  identity?: AuthorIdentity;
  onAuthorClick?: () => void;
}

/** Small mask glyph marking a per-thread persona. */
function PersonaMark({ size = 12 }: { size?: number }) {
  return (
    <VenetianMask
      size={size}
      className="shrink-0 text-muted"
      aria-label="Anonymous persona"
    />
  );
}

/**
 * Author identity row. Badge group [Signed][KYC] is right-justified (§2.4).
 */
export function AuthorRow({
  author,
  handle,
  tier,
  signTier,
  authorGeo,
  signedMode = "icon",
  kycMode = "full",
  timestamp,
  layout = "card",
  scopeSlot,
  scopeContinuationSlot,
  identity,
  onAuthorClick,
}: AuthorRowProps) {
  const isComment = layout === "comment";
  const isPersona = identity?.isPersona ?? false;
  const avatarSeed = identity?.seed ?? handle ?? author;
  const badges = (
    <AuthorBadgeGroup
      signTier={signTier}
      tier={tier}
      authorGeo={authorGeo}
      signedMode={signedMode}
      kycMode={kycMode}
      align="right"
    />
  );

  if (!isComment) {
    // Secondary line: personas explain themselves; self rows hint how others
    // see them; revealed rows keep the @handle.
    const secondary = isPersona ? (
      <span className="min-w-0 truncate text-xs italic text-muted">
        anonymous
      </span>
    ) : handle ? (
      <button
        type="button"
        onClick={onAuthorClick}
        disabled={!onAuthorClick}
        className="min-w-0 truncate text-left text-xs text-muted disabled:cursor-default"
      >
        @{handle}
        {identity?.seenByOthersAs ? (
          <span className="italic"> · seen as {identity.seenByOthersAs}</span>
        ) : null}
      </button>
    ) : timestamp ? (
      <span className="min-w-0 truncate text-xs text-muted">{timestamp}</span>
    ) : (
      <span aria-hidden />
    );

    return (
      <div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAuthorClick}
            disabled={!onAuthorClick}
            className="shrink-0 self-start disabled:cursor-default"
          >
            <Avatar name={author} seed={avatarSeed} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={onAuthorClick}
                disabled={!onAuthorClick}
                className="flex min-w-0 items-center gap-1 text-left disabled:cursor-default"
              >
                <span className="min-w-0 truncate text-sm font-semibold leading-tight text-ink">
                  {author}
                </span>
                {isPersona ? <PersonaMark /> : null}
              </button>
              {badges}
            </div>
            <div className="-mt-px flex items-baseline justify-between gap-2">
              {secondary}
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
        <Avatar name={author} seed={avatarSeed} size="sm" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{author}</span>
            {isPersona ? (
              <span className="self-center">
                <PersonaMark size={11} />
              </span>
            ) : null}
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
