"use client";

import type { ReactNode } from "react";
import type { AuthorIdentity, SignTier, VerificationTier } from "@/lib/types";
import { AuthorRow, authorBadgeModes } from "@/components/identity";

interface RecordCardHeaderProps {
  author: string;
  tier: VerificationTier;
  signTier?: SignTier;
  isHomeAuthor?: boolean;
  /** Record rows: stacked @handle. Comment rows: inline relative time. */
  handle?: string;
  timestamp?: string;
  variant?: "record" | "comment";
  /** Comment nesting depth (1 = root); drives badge display modes. */
  depth?: number;
  scopeSlot?: ReactNode;
  scopeContinuationSlot?: ReactNode;
  /** Viewer-resolved author identity (persona / self affordances). */
  identity?: AuthorIdentity;
  onAuthorClick?: () => void;
}

/** Record / comment identity header — wraps AuthorRow with the right layout. */
export function RecordCardHeader({
  author,
  tier,
  signTier,
  isHomeAuthor = false,
  handle,
  timestamp,
  variant = "record",
  depth = 1,
  scopeSlot,
  scopeContinuationSlot,
  identity,
  onAuthorClick,
}: RecordCardHeaderProps) {
  const surface = variant === "comment" ? "comment" : "post";
  const { signedMode, kycMode } = authorBadgeModes(surface, depth);

  return (
    <AuthorRow
      author={author}
      handle={variant === "record" ? handle : undefined}
      identity={identity}
      tier={tier}
      signTier={signTier}
      isHomeAuthor={isHomeAuthor}
      signedMode={signedMode}
      kycMode={kycMode}
      timestamp={variant === "comment" ? timestamp : undefined}
      layout={variant === "comment" ? "comment" : "card"}
      scopeSlot={variant === "record" ? scopeSlot : undefined}
      scopeContinuationSlot={
        variant === "record" ? scopeContinuationSlot : undefined
      }
      onAuthorClick={onAuthorClick}
    />
  );
}
