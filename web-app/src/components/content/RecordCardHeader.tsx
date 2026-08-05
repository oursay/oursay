"use client";

import type { ReactNode } from "react";
import type {
  AuthorGeoRelation,
  AuthorIdentity,
  PlatformRole,
  SignTier,
  VerificationTier,
} from "@/lib/types";
import { AuthorRow, authorBadgeModes } from "@/components/identity";

interface RecordCardHeaderProps {
  author: string;
  tier: VerificationTier;
  /** Official role flag (not a KYC tier). */
  official?: boolean;
  signTier?: SignTier;
  platformRole?: PlatformRole | null;
  /** Residency author's spatial relation to the context. */
  authorGeo?: AuthorGeoRelation;
  /** Record rows: stacked @handle. Comment rows: inline relative time. */
  handle?: string;
  timestamp?: ReactNode;
  variant?: "record" | "comment";
  /** Comment nesting depth (1 = root); drives badge display modes. */
  depth?: number;
  scopeSlot?: ReactNode;
  scopeContinuationSlot?: ReactNode;
  /** Viewer-resolved author identity (persona / self affordances). */
  identity?: AuthorIdentity;
  onAuthorClick?: () => void;
  onPersonaClick?: () => void;
}

/** Record / comment identity header — wraps AuthorRow with the right layout. */
export function RecordCardHeader({
  author,
  tier,
  official,
  signTier,
  platformRole,
  authorGeo,
  handle,
  timestamp,
  variant = "record",
  depth = 1,
  scopeSlot,
  scopeContinuationSlot,
  identity,
  onAuthorClick,
  onPersonaClick,
}: RecordCardHeaderProps) {
  const surface = variant === "comment" ? "comment" : "post";
  const { signedMode, kycMode } = authorBadgeModes(surface, depth);

  return (
    <AuthorRow
      author={author}
      handle={variant === "record" ? handle : undefined}
      identity={identity}
      tier={tier}
      official={official}
      signTier={signTier}
      platformRole={platformRole}
      authorGeo={authorGeo}
      signedMode={signedMode}
      kycMode={kycMode}
      timestamp={variant === "comment" ? timestamp : undefined}
      layout={variant === "comment" ? "comment" : "card"}
      scopeSlot={variant === "record" ? scopeSlot : undefined}
      scopeContinuationSlot={
        variant === "record" ? scopeContinuationSlot : undefined
      }
      onAuthorClick={onAuthorClick}
      onPersonaClick={onPersonaClick}
    />
  );
}
