"use client";

import type { ReactNode } from "react";
import type { VerificationTier } from "@/lib/types";
import { AuthorRow } from "@/components/identity";

interface RecordCardHeaderProps {
  author: string;
  tier: VerificationTier;
  isHomeAuthor?: boolean;
  /** Record rows: stacked @handle. Comment rows: inline relative time. */
  handle?: string;
  timestamp?: string;
  variant?: "record" | "comment";
  scopeSlot?: ReactNode;
  onAuthorClick?: () => void;
}

/** Record / comment identity header — wraps AuthorRow with the right layout. */
export function RecordCardHeader({
  author,
  tier,
  isHomeAuthor = false,
  handle,
  timestamp,
  variant = "record",
  scopeSlot,
  onAuthorClick,
}: RecordCardHeaderProps) {
  return (
    <AuthorRow
      author={author}
      handle={variant === "record" ? handle : undefined}
      tier={tier}
      isHomeAuthor={isHomeAuthor}
      timestamp={variant === "comment" ? timestamp : undefined}
      layout={variant === "comment" ? "comment" : "card"}
      scopeSlot={variant === "record" ? scopeSlot : undefined}
      onAuthorClick={onAuthorClick}
    />
  );
}
