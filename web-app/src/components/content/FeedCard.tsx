"use client";

import { useState } from "react";
import type { FeedItem, ViewerContext, VerificationTier } from "@/lib/types";
import { Button } from "@/components/ui";
import { ScopeTag } from "./ScopeTag";
import { PetitionProgress } from "./PetitionProgress";
import { PollOptions } from "./PollOptions";
import { ResultOutcome } from "./ResultOutcome";
import { RecordCard } from "./RecordCard";
import { RecordCardHeader } from "./RecordCardHeader";
import { RecordCardFooter } from "./RecordCardFooter";

interface FeedCardProps {
  item: FeedItem;
  viewer: ViewerContext;
  /** Active Verified filter — thins social counts. */
  tierMin?: VerificationTier;
  hideJur?: boolean;
  hideDistrict?: boolean;
  resolveDistrict?: (slug: string) => string;
  onAuthorClick?: () => void;
  onTitleClick?: () => void;
  onCommentsClick?: () => void;
  onShare?: () => void;
  shareCount?: number;
  shared?: boolean;
  onReact?: (dir: "up" | "down") => void;
  selectedReaction?: "up" | "down" | null;
  selectedVote?: string | null;
  signedPetition?: boolean;
  onVote?: (label: string) => void;
  onSignPetition?: () => void;
  onEditsClick?: () => void;
  onJurisdictionClick?: () => void;
  onDistrictClick?: (slug: string) => void;
}

/** Feed/list record card — composes the shared RecordCard shell. */
export function FeedCard({
  item,
  viewer,
  tierMin = 0,
  hideJur = false,
  hideDistrict = false,
  resolveDistrict,
  onAuthorClick,
  onTitleClick,
  onCommentsClick,
  onShare,
  shareCount,
  shared,
  onReact,
  selectedReaction = null,
  selectedVote = null,
  signedPetition = false,
  onVote,
  onSignPetition,
  onEditsClick,
  onJurisdictionClick,
  onDistrictClick,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const multiDistrict = item.districts.length > 1;
  const scopeProps = {
    jurisdiction: item.jurisdiction,
    districtSlugs: item.districts,
    hideJur,
    hideDistrict,
    resolveDistrict,
    expanded,
    onExpandToggle: () => setExpanded((v) => !v),
    onJurisdictionClick,
    onDistrictClick,
  };

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
          onAuthorClick={onAuthorClick}
          scopeSlot={
            <ScopeTag
              {...scopeProps}
              part={expanded && multiDistrict ? "head" : "all"}
            />
          }
          scopeContinuationSlot={
            expanded && multiDistrict ? (
              <ScopeTag {...scopeProps} part="tail" />
            ) : undefined
          }
        />
      }
      body={
        <>
          <button
            type="button"
            onClick={onTitleClick}
            className="block w-full text-left"
          >
            <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
              {item.body.join(" ")}
            </p>
            <span className="mt-1 inline-block text-sm font-semibold text-ink">
              …more
            </span>
          </button>
          {item.kind === "petition" ? (
            <div className="mt-3">
              <PetitionProgress
                sig={item.sig ?? 0}
                goal={item.goal ?? 1}
                attachedPoll={item.attachedPoll}
                tierMin={tierMin}
              >
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  fullWidth
                  className="mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSignPetition?.();
                  }}
                >
                  Sign the Petition
                </Button>
              </PetitionProgress>
            </div>
          ) : null}
          {item.kind === "poll" && item.options ? (
            <div className="mt-3">
              <PollOptions
                options={item.options}
                selectedVote={selectedVote}
                isFinalJurisdiction={item.jurisdiction === "Alberta"}
                tierMin={tierMin}
                onVote={onVote}
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
          selectedReaction={selectedReaction}
          sig={item.sig}
          voteTotal={
            item.kind === "poll" && item.options
              ? item.options.reduce((a, o) => a + o.v, 0)
              : undefined
          }
          comments={item.comments}
          edits={item.edits}
          tierMin={tierMin}
          onReact={onReact}
          onEditsClick={onEditsClick}
          onCommentsClick={onCommentsClick}
          onShare={onShare}
          shareCount={shareCount}
          shared={shared}
          signedPetition={signedPetition}
          votedPoll={selectedVote != null}
          onOpenPost={onTitleClick}
        />
      }
    />
  );
}
