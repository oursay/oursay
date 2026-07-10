"use client";

import { useEffect, useState } from "react";
import { jurisdictionAllowsVoteChange } from "@/lib/signing";
import { relTime, useNow } from "@/lib/read-model";
import type { FeedItem } from "@/lib/types";
import type { SharePreview } from "@/lib/share/preview";
import { ScopeTag } from "./ScopeTag";
import { PetitionProgress } from "./PetitionProgress";
import { PollOptions } from "./PollOptions";
import { ResultOutcome } from "./ResultOutcome";
import { RecordCard } from "./RecordCard";
import { RecordCardHeader } from "./RecordCardHeader";
import { RecordCardFooter } from "./RecordCardFooter";
import { CommentCard } from "./CommentCard";

interface ShareCardProps {
  preview: SharePreview;
  /** Viewer's reaction — highlights one segment; both when unset. */
  selectedReaction?: "up" | "down" | null;
}

/** Read-only feed-style card for the share modal preview. */
export function ShareCard({
  preview,
  selectedReaction = null,
}: ShareCardProps) {
  const now = useNow();
  const [reactionEmphasis, setReactionEmphasis] = useState<"both" | "my">(
    () => (selectedReaction ? "my" : "both"),
  );

  useEffect(() => {
    setReactionEmphasis(selectedReaction ? "my" : "both");
  }, [selectedReaction, preview]);

  const toggleReactionEmphasis = () =>
    setReactionEmphasis((mode) => (mode === "both" ? "my" : "both"));

  const shareReactionProps = {
    selectedReaction:
      reactionEmphasis === "my" ? selectedReaction : null,
    highlightReactionPill: reactionEmphasis === "both",
    onShareReactionToggle: toggleReactionEmphasis,
  };

  if (preview.variant === "comment") {
    const { node, depth } = preview;
    return (
      <CommentCard
        author={node.author}
        tier={node.tier}
        signTier={node.signTier}
        authorGeo={node.authorGeo}
        identity={node.identity}
        timestamp={relTime(node.ts, now)}
        depth={depth}
        body={
          <div className="space-y-1">
            {node.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        }
        up={node.up}
        down={node.down}
        edits={node.edits}
        readOnly
        {...shareReactionProps}
      />
    );
  }

  return (
    <ShareRecordCard
      item={preview.item}
      shareReactionProps={shareReactionProps}
    />
  );
}

function ShareRecordCard({
  item,
  shareReactionProps,
}: {
  item: FeedItem;
  shareReactionProps: {
    selectedReaction: "up" | "down" | null;
    highlightReactionPill: boolean;
    onShareReactionToggle: () => void;
  };
}) {
  return (
    <RecordCard
      header={
        <RecordCardHeader
          author={item.author}
          handle={item.handle}
          identity={item.identity}
          tier={item.tier}
          signTier={item.signTier}
          authorGeo={item.authorGeo}
          scopeSlot={
            <ScopeTag
              jurisdiction={item.jurisdiction}
              districtSlugs={item.districts}
              part="all"
            />
          }
        />
      }
      body={
        <>
          <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
            {item.body.join(" ")}
          </p>
          {item.kind === "petition" ? (
            <div className="mt-3">
              <PetitionProgress
                sig={item.sig ?? 0}
                goal={item.goal ?? 1}
                attachedPoll={item.attachedPoll}
              />
            </div>
          ) : null}
          {item.kind === "poll" && item.options ? (
            <div className="mt-3">
              <PollOptions
                options={item.options}
                isFinalJurisdiction={!jurisdictionAllowsVoteChange(item.jurisdiction)}
              />
            </div>
          ) : null}
          {item.kind === "result" && item.options ? (
            <div className="mt-3">
              <ResultOutcome options={item.options} />
            </div>
          ) : null}
        </>
      }
      footer={
        <RecordCardFooter
          kind={item.kind}
          up={item.up ?? 0}
          down={item.down ?? 0}
          sig={item.sig}
          voteTotal={
            item.kind === "poll" && item.options
              ? item.options.reduce((a, o) => a + o.v, 0)
              : undefined
          }
          comments={item.comments}
          edits={item.edits}
          readOnly
          highlightCommentPill
          {...shareReactionProps}
        />
      }
    />
  );
}
