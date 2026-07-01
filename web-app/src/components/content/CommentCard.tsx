"use client";

import type { ReactNode } from "react";
import type { VerificationTier } from "@/lib/types";
import { RecordCardHeader } from "./RecordCardHeader";
import { RecordCardFooter } from "./RecordCardFooter";

interface CommentCardProps {
  author: string;
  tier: VerificationTier;
  isHomeAuthor?: boolean;
  timestamp: string;
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
}

/** One comment row — header · body · footer (no comment pill). */
export function CommentCard({
  author,
  tier,
  isHomeAuthor = false,
  timestamp,
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
}: CommentCardProps) {
  return (
    <div>
      <RecordCardHeader
        author={author}
        tier={tier}
        isHomeAuthor={isHomeAuthor}
        timestamp={timestamp}
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
        />
      </div>
    </div>
  );
}
