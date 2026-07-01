"use client";

import type { RecordKind, VerificationTier } from "@/lib/types";
import { ReactionButtons } from "./ReactionButtons";
import { EditCountLink } from "./EditCountLink";
import { CommentPill } from "./CommentPill";
import { SignaturePill, VotePill } from "./CivicPills";
import { ReplyLink } from "./ReplyLink";

interface RecordCardFooterProps {
  /** Omit for comment footers. */
  kind?: RecordKind | "comment";
  up?: number;
  down?: number;
  selectedReaction?: "up" | "down" | null;
  sig?: number;
  voteTotal?: number;
  /** Viewer signed this petition (footer pill accent). */
  signedPetition?: boolean;
  /** Viewer cast a vote on this poll (footer pill accent). */
  votedPoll?: boolean;
  comments?: number;
  edits?: number;
  tierMin?: VerificationTier;
  onReact?: (dir: "up" | "down") => void;
  onReply?: () => void;
  onEditsClick?: () => void;
  onCommentsClick?: () => void;
  /** Opens the full post (feed cards — same as title / …more). */
  onOpenPost?: () => void;
}

/**
 * Unified record footer: civic metric · reply · edits · comment pill.
 * Comments pass kind="comment" and omit the comment pill.
 */
export function RecordCardFooter({
  kind = "comment",
  up = 0,
  down = 0,
  selectedReaction = null,
  sig,
  voteTotal,
  signedPetition = false,
  votedPoll = false,
  comments,
  edits,
  tierMin = 0,
  onReact,
  onReply,
  onEditsClick,
  onCommentsClick,
  onOpenPost,
}: RecordCardFooterProps) {
  const hasReactions = kind === "statement" || kind === "result";
  const showComments = kind !== "comment" && comments !== undefined;

  return (
    <div className="flex items-center gap-2">
      {hasReactions ? (
        <ReactionButtons
          up={up}
          down={down}
          selected={selectedReaction}
          tierMin={tierMin}
          onReact={onReact}
        />
      ) : null}
      {kind === "petition" && sig !== undefined ? (
        <SignaturePill
          count={sig}
          participated={signedPetition}
          onClick={onOpenPost}
        />
      ) : null}
      {kind === "poll" && voteTotal !== undefined ? (
        <VotePill
          count={voteTotal}
          participated={votedPoll}
          onClick={onOpenPost}
        />
      ) : null}
      {onReply ? <ReplyLink onClick={onReply} /> : null}
      <EditCountLink count={edits} onClick={onEditsClick} />
      {showComments ? (
        <CommentPill
          count={comments ?? 0}
          onClick={onCommentsClick}
          className="ml-auto"
        />
      ) : null}
    </div>
  );
}
