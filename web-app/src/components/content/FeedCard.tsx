"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import type { FeedItem, ViewerContext, VerificationTier } from "@/lib/types";
import { formatCount, isHomeAuthor } from "@/components/utils";
import { Button } from "@/components/ui";
import { AuthorRow } from "@/components/identity";
import { ScopeTag } from "./ScopeTag";
import { ReactionButtons } from "./ReactionButtons";
import { PetitionProgress } from "./PetitionProgress";
import { PollOptions } from "./PollOptions";
import { EditCountLink } from "./EditCountLink";

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
  onReact?: (dir: "up" | "down") => void;
  selectedReaction?: "up" | "down" | null;
  selectedVote?: string | null;
  onVote?: (label: string) => void;
  onSignPetition?: () => void;
  onEditsClick?: () => void;
  onJurisdictionClick?: () => void;
  onDistrictClick?: (slug: string) => void;
}

/** One feed/list card. One shape renders every record kind (wireframe buildCard). */
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
  onReact,
  selectedReaction = null,
  selectedVote = null,
  onVote,
  onSignPetition,
  onEditsClick,
  onJurisdictionClick,
  onDistrictClick,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const home = isHomeAuthor(item.districts, viewer.kycTier, viewer.viewerDistricts);
  const hasReactions = item.kind === "statement" || item.kind === "result";

  return (
    <article className="rounded-xl border border-border-strong bg-surface p-3 shadow-sm">
      <AuthorRow
        author={item.author}
        handle={item.handle}
        tier={item.tier}
        isHomeAuthor={home}
        layout="card"
        onAuthorClick={onAuthorClick}
        scopeSlot={
          <ScopeTag
            jurisdiction={item.jurisdiction}
            districtSlugs={item.districts}
            hideJur={hideJur}
            hideDistrict={hideDistrict}
            resolveDistrict={resolveDistrict}
            expanded={expanded}
            onExpandToggle={() => setExpanded((v) => !v)}
            onJurisdictionClick={onJurisdictionClick}
            onDistrictClick={onDistrictClick}
          />
        }
      />

      <button
        type="button"
        onClick={onTitleClick}
        className="mt-1 block w-full text-left"
      >
        <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
          {item.body.join(" ")}
        </p>
        <span className="mt-1 inline-block text-sm font-semibold text-ink">
          …more
        </span>
      </button>

      <div className="mt-3">
        {item.kind === "petition" ? (
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
        ) : null}
        {item.kind === "poll" && item.options ? (
          <PollOptions
            options={item.options}
            selectedVote={selectedVote}
            isFinalJurisdiction={item.jurisdiction === "Alberta"}
            tierMin={tierMin}
            onVote={onVote}
          />
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {hasReactions ? (
          <ReactionButtons
            up={item.up ?? 0}
            down={item.down ?? 0}
            selected={selectedReaction}
            scale="card"
            tierMin={tierMin}
            onReact={onReact}
          />
        ) : null}
        {item.kind === "petition" ? (
          <span className="text-xs text-ink-soft">
            {formatCount(item.sig ?? 0)} signatures
          </span>
        ) : null}
        {item.kind === "poll" && item.options ? (
          <span className="text-xs text-ink-soft">
            {formatCount(item.options.reduce((a, o) => a + o.v, 0))} votes
          </span>
        ) : null}
        <EditCountLink count={item.edits} onClick={onEditsClick} />
        <button
          type="button"
          onClick={onCommentsClick}
          className="pill-chrome ml-auto inline-flex h-5 items-center gap-1 rounded-full bg-surface px-2 text-xs text-ink-soft hover:bg-surface-muted"
        >
          <MessageSquare size={11} aria-hidden />
          {formatCount(item.comments)}
        </button>
      </div>
    </article>
  );
}
