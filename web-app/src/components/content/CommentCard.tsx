"use client";

import type { ReactNode } from "react";
import type { AuthorIdentity, SignTier, VerificationTier } from "@/lib/types";
import type { AuthorGeoRelation } from "@/components/identity";
import { RecordCardHeader } from "./RecordCardHeader";
import { RecordCardFooter } from "./RecordCardFooter";

interface CommentCardProps {
  author: string;
  tier: VerificationTier;
  signTier?: SignTier;
  /** Residency author's spatial relation to the open post. */
  authorGeo?: AuthorGeoRelation;
  /** Viewer-resolved author identity (persona / self affordances). */
  identity?: AuthorIdentity;
  timestamp: string;
  depth?: number;
  body: ReactNode;
  up: number;
  down: number;
  selectedReaction?: "up" | "down" | null;
  edits?: number;
  tierMin?: VerificationTier;
  onAuthorClick?: () => void;
  onReact?: (dir: "up" | "down") => void;
  onReply?: () => void;
  onEditsClick?: () => void;
  onShare?: () => void;
  shareCount?: number;
  shared?: boolean;
}

/** One comment row — header · body · footer (no comment pill). */
export function CommentCard({
  author,
  tier,
  signTier,
  authorGeo,
  identity,
  timestamp,
  depth = 1,
  body,
  up,
  down,
  selectedReaction = null,
  edits,
  tierMin = 0,
  onAuthorClick,
  onReact,
  onReply,
  onEditsClick,
  onShare,
  shareCount,
  shared,
}: CommentCardProps) {
  return (
    <div>
      <RecordCardHeader
        author={author}
        tier={tier}
        signTier={signTier}
        authorGeo={authorGeo}
        identity={identity}
        timestamp={timestamp}
        depth={depth}
        variant="comment"
        onAuthorClick={onAuthorClick}
      />
      <div className="mt-1 pl-8 text-sm text-ink-soft">{body}</div>
      <div className="mt-2 pl-8">
        <RecordCardFooter
          kind="comment"
          up={up}
          down={down}
          selectedReaction={selectedReaction}
          edits={edits}
          tierMin={tierMin}
          onReact={onReact}
          onReply={onReply}
          onEditsClick={onEditsClick}
          onShare={onShare}
          shareCount={shareCount}
          shared={shared}
        />
      </div>
    </div>
  );
}
