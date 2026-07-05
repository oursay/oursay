"use client";

import type { RecordKind, VerificationTier } from "@/lib/types";
import { ReactionButtons } from "./ReactionButtons";
import { EditCountLink } from "./EditCountLink";
import { CommentPill } from "./CommentPill";
import { SharePill } from "./SharePill";
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
  /** Share count shown on the share pill. */
  shareCount?: number;
  /** Viewer has already shared this record/comment (pill accent). */
  shared?: boolean;
  tierMin?: VerificationTier;
  onReact?: (dir: "up" | "down") => void;
  onReply?: () => void;
  onEditsClick?: () => void;
  onCommentsClick?: () => void;
  /** Opens the share sheet for this record / comment. */
  onShare?: () => void;
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
  shareCount = 0,
  shared = false,
  tierMin = 0,
  onReact,
  onReply,
  onEditsClick,
  onCommentsClick,
  onShare,
  onOpenPost,
}: RecordCardFooterProps) {
  const isComment = kind === "comment";
  const hasReactions = kind === "statement" || kind === "result" || isComment;
  const showComments = !isComment && comments !== undefined;

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
      {/* Comments: a single right-justified share pill on the reply line.
          Records: the share pill sits beside the comment-count pill, right-aligned. */}
      {isComment ? (
        onShare ? (
          <SharePill
            count={shareCount}
            shared={shared}
            onClick={onShare}
            className="ml-auto"
          />
        ) : null
      ) : showComments || onShare ? (
        <div className="ml-auto flex items-center gap-2">
          {showComments ? (
            <CommentPill count={comments ?? 0} onClick={onCommentsClick} />
          ) : null}
          {onShare ? (
            <SharePill count={shareCount} shared={shared} onClick={onShare} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
