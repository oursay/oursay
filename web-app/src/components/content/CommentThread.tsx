"use client";

import { COMMENT_MAX_DEPTH } from "@/lib/types";
import type { CommentNode, ViewerContext, VerificationTier } from "@/lib/types";
import { relTime } from "@/lib/read-model";
import { isHomeAuthor } from "@/components/utils";
import { CommentCard } from "./CommentCard";

interface CommentThreadProps {
  nodes: CommentNode[];
  viewer: ViewerContext;
  now: Date;
  /** Active Verified filter — thins comment reaction counts. */
  tierMin?: VerificationTier;
  depth?: number;
  maxDepth?: number;
  /** Leading @handle for a flattened max-depth reply (internal). */
  mentionPrefix?: string;
  onReply?: (node: CommentNode) => void;
  onAuthorClick?: (node: CommentNode) => void;
  onReact?: (node: CommentNode, dir: "up" | "down") => void;
  onEditsClick?: (node: CommentNode) => void;
}

/**
 * Nested comment thread. Replies nest visually up to COMMENT_MAX_DEPTH; a reply
 * beyond that depth flattens to a sibling at the deepest level, seeded with the
 * replyee's @handle as its first token (§2.4). Filtering is done by the parent.
 */
export function CommentThread({
  nodes,
  viewer,
  now,
  tierMin = 0,
  depth = 1,
  maxDepth = COMMENT_MAX_DEPTH,
  mentionPrefix,
  onReply,
  onAuthorClick,
  onReact,
  onEditsClick,
}: CommentThreadProps) {
  return (
    <ul className={depth > 1 ? "space-y-4 border-l border-border pl-2" : "space-y-4"}>
      {nodes.map((node, i) => {
        const home = isHomeAuthor(node.districts, viewer.kycTier, viewer.viewerDistricts);
        const atMax = depth >= maxDepth;
        const prefix = i === 0 ? mentionPrefix : undefined;
        return (
          <li key={`${node.handle}-${i}`}>
            <CommentCard
              author={node.author}
              tier={node.tier}
              signTier={node.signTier}
              isHomeAuthor={home}
              timestamp={relTime(node.ts, now)}
              depth={depth}
              body={
                <>
                  {node.body.map((line, li) => (
                    <p key={li}>
                      {li === 0 && prefix ? (
                        <span className="font-semibold text-brand-700">{prefix} </span>
                      ) : null}
                      {line}
                    </p>
                  ))}
                </>
              }
              up={node.up}
              down={node.down}
              selectedReaction={node._my ?? null}
              edits={node.edits}
              tierMin={tierMin}
              onAuthorClick={onAuthorClick ? () => onAuthorClick(node) : undefined}
              onReact={onReact ? (dir) => onReact(node, dir) : undefined}
              onReply={onReply ? () => onReply(node) : undefined}
              onEditsClick={onEditsClick ? () => onEditsClick(node) : undefined}
            />

            {node.replies.length > 0 ? (
              <div className="mt-4 ml-5">
                {atMax ? (
                  <CommentThread
                    nodes={node.replies}
                    viewer={viewer}
                    now={now}
                    tierMin={tierMin}
                    depth={depth}
                    maxDepth={maxDepth}
                    mentionPrefix={`@${node.handle}`}
                    onReply={onReply}
                    onAuthorClick={onAuthorClick}
                    onReact={onReact}
                    onEditsClick={onEditsClick}
                  />
                ) : (
                  <CommentThread
                    nodes={node.replies}
                    viewer={viewer}
                    now={now}
                    tierMin={tierMin}
                    depth={depth + 1}
                    maxDepth={maxDepth}
                    onReply={onReply}
                    onAuthorClick={onAuthorClick}
                    onReact={onReact}
                    onEditsClick={onEditsClick}
                  />
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
