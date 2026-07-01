"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import type { FeedItem, ViewerContext, VerificationTier } from "@/lib/types";
import { formatCount, isHomeAuthor } from "@/components/utils";
import { AuthorRow } from "@/components/identity";
import { ScopeTag } from "./ScopeTag";
import { ReactionButtons } from "./ReactionButtons";
import { PetitionProgress } from "./PetitionProgress";
import { PollOptions } from "./PollOptions";
import { EditCountLink } from "./EditCountLink";
import { RECORD_TYPE_ICON } from "./recordType";

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
  onEditsClick,
  onJurisdictionClick,
  onDistrictClick,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = RECORD_TYPE_ICON[item.kind];
  const home = isHomeAuthor(item.districts, viewer.kycTier, viewer.viewerDistricts);
  const hasReactions = item.kind === "statement" || item.kind === "result";

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <TypeIcon size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <AuthorRow
            author={item.author}
            handle={item.handle}
            tier={item.tier}
            isHomeAuthor={home}
            layout="card"
            onAuthorClick={onAuthorClick}
          />
        </div>
      </div>

      <div className="mt-2 flex justify-end">
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
      </div>

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
          />
        ) : null}
        {item.kind === "poll" && item.options ? (
          <PollOptions options={item.options} tierMin={tierMin} />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {hasReactions ? (
          <ReactionButtons
            up={item.up ?? 0}
            down={item.down ?? 0}
            scale="card"
            tierMin={tierMin}
            onReact={onReact}
          />
        ) : null}
        <EditCountLink count={item.edits} onClick={onEditsClick} />
        <button
          type="button"
          onClick={onCommentsClick}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm text-ink-soft hover:bg-surface-muted"
        >
          <MessageSquare size={14} aria-hidden />
          {formatCount(item.comments)}
        </button>
      </div>
    </article>
  );
}
