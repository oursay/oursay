"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRecordDetail } from "@/lib/api";
import type { CommentNode, RecordDetail, RecordKind } from "@/lib/types";
import { postQualifiesForAffected, relTime } from "@/lib/read-model";
import {
  NOW,
  POST_PETITION,
  POST_POLL,
  POST_RESULT,
  districtName,
} from "@/lib/mock";
import {
  Button,
  CommentThread,
  PetitionProgress,
  PollOptions,
  RecordCard,
  RecordCardFooter,
  RecordCardHeader,
  RecordTypeSection,
  ScopeTag,
} from "@/components";
import { isHomeAuthor } from "@/components/utils";
import { postPath, profilePath, districtPath } from "@/lib/routes";
import { COMMENTS_SECTION_ID, scrollToCommentsSection } from "@/lib/scroll";
import { useApp } from "@/lib/state";

function countNodes(nodes: CommentNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.replies), 0);
}

export function PostView({ kind }: { kind: RecordKind }) {
  const app = useApp();
  const router = useRouter();

  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [fullComments, setFullComments] = useState<CommentNode[]>([]);
  const [shownComments, setShownComments] = useState<CommentNode[]>([]);

  useEffect(() => {
    setDetail(null);
    setFullComments([]);
    setShownComments([]);
    let active = true;
    Promise.all([
      getRecordDetail("", kind),
      getRecordDetail("", kind, { viewer: app.viewer, filter: app.feedFilter }),
    ]).then(([full, filtered]) => {
      if (!active) return;
      setDetail(full.detail);
      setFullComments(full.comments);
      setShownComments(filtered.comments);
      app.setPostAffectedEligible(postQualifiesForAffected(full.detail));
    });
    return () => {
      active = false;
    };
  }, [kind, app.viewer, app.feedFilter]);

  useEffect(() => {
    if (!detail) return;
    app.setPageJurisdiction(detail.jurisdiction);
    return () => app.setPageJurisdiction(null);
  }, [kind, detail?.jurisdiction]);

  useEffect(() => {
    if (!detail) return;
    if (window.location.hash !== `#${COMMENTS_SECTION_ID}`) return;
    requestAnimationFrame(() => scrollToCommentsSection());
  }, [detail]);

  if (!detail) {
    return <p className="p-6 text-center text-sm text-muted">Record not found.</p>;
  }

  const target = {
    id: detail.id,
    jurisdiction: detail.jurisdiction,
    title: detail.title,
    sig: detail.sig,
    up: detail.up,
    down: detail.down,
    districts: detail.districts,
  };
  const sig = app.petitionSigFor(target);
  const reactions = app.reactionCountsFor(target);
  const displayDetail: RecordDetail =
    detail.kind === "petition" ? { ...detail, sig } : detail;
  const home = isHomeAuthor(detail.districts, app.viewer.kycTier, app.viewer.viewerDistricts);
  const isFinal = detail.jurisdiction === "Alberta";
  const tierMin = app.state.verified;

  const trueTotal = countNodes(fullComments);
  const hidden = trueTotal - countNodes(shownComments);

  const petitionTarget = {
    id: POST_PETITION.id,
    jurisdiction: POST_PETITION.jurisdiction,
    title: POST_PETITION.title,
    sig: POST_PETITION.sig,
    districts: POST_PETITION.districts,
  };
  const petitionPreview = {
    title: POST_PETITION.title,
    sig: app.petitionSigFor(petitionTarget),
    goal: POST_PETITION.goal ?? 1,
  };

  return (
    <div className="space-y-4 p-4">
      <RecordCard
        variant="detail"
        header={
          <RecordCardHeader
            author={detail.author}
            handle={detail.handle}
            tier={detail.tier}
            isHomeAuthor={home}
            onAuthorClick={() => router.push(profilePath(detail.handle))}
            scopeSlot={
              detail.districts.length > 0 ? (
                <ScopeTag
                  jurisdiction={detail.jurisdiction}
                  districtSlugs={detail.districts}
                  hideJur
                  resolveDistrict={districtName}
                  onDistrictClick={(slug) => router.push(districtPath(slug))}
                />
              ) : undefined
            }
          />
        }
        body={
          <>
            <div>
              <h1 className="text-lg font-bold text-ink">{detail.title}</h1>
              <p className="mt-0.5 text-xs text-muted">{relTime(detail.ts, NOW)}</p>
            </div>
            <div className="mt-3 space-y-1 text-sm text-ink-soft">
              {detail.body.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            {detail.kind === "petition" ? (
              <div className="mt-3">
                <PetitionProgress
                  sig={sig}
                  goal={detail.goal ?? 1}
                  attachedPoll={detail.attachedPoll}
                  tierMin={tierMin}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    className="mt-1"
                    onClick={() => app.signPetition(target)}
                  >
                    Sign the Petition
                  </Button>
                </PetitionProgress>
              </div>
            ) : null}
            {detail.kind === "poll" && detail.options ? (
              <div className="mt-3">
                <PollOptions
                  options={detail.options}
                  selectedVote={app.voteFor(detail.id)}
                  isFinalJurisdiction={isFinal}
                  tierMin={tierMin}
                  onVote={(label) => app.votePoll(target, label)}
                />
              </div>
            ) : null}
            {detail.kind === "result" && detail.options ? (
              <div className="mt-3">
                <PollOptions options={detail.options} frozen tierMin={tierMin} />
              </div>
            ) : null}
          </>
        }
        footer={
          <RecordCardFooter
            kind={detail.kind}
            up={reactions.up}
            down={reactions.down}
            selectedReaction={app.reactionFor(detail.id)}
            sig={detail.kind === "petition" ? sig : undefined}
            voteTotal={
              detail.kind === "poll" && detail.options
                ? detail.options.reduce((a, o) => a + o.v, 0)
                : undefined
            }
            comments={trueTotal}
            edits={detail.edits}
            tierMin={tierMin}
            onReact={(dir) => app.react(target, dir)}
            onReply={app.startReply}
            onEditsClick={() => app.notify("Edit history is not built in this demo.")}
            onCommentsClick={scrollToCommentsSection}
          />
        }
      />

      <RecordTypeSection
        detail={displayDetail}
        petitionPreview={petitionPreview}
        pollPreview={{ title: POST_POLL.title, options: POST_POLL.options ?? [] }}
        resultPreview={{ options: POST_RESULT.options ?? [] }}
        onSeeFullPetition={() => router.push(postPath("petition"))}
        onSeeFullPoll={() => router.push(postPath("poll"))}
        onSeeFullResult={() => router.push(postPath("result"))}
      />

      <section id={COMMENTS_SECTION_ID} className="scroll-mt-3 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Comments
          </h2>
          {hidden > 0 ? (
            <span className="text-xs text-muted">{hidden} hidden by filters</span>
          ) : null}
        </div>

        {app.state.replyOpen ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <textarea
              rows={3}
              placeholder="Write a reply…"
              className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={app.closeReply}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  app.closeReply();
                  app.notify("Reply posted (demo).");
                }}
              >
                Post Reply
              </Button>
            </div>
          </div>
        ) : null}

        {shownComments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No comments match the current filters.
          </p>
        ) : (
          <CommentThread
            nodes={shownComments}
            viewer={app.viewer}
            now={NOW}
            tierMin={tierMin}
            onReply={app.startReply}
            onAuthorClick={(node) => router.push(profilePath(node.handle))}
            onReact={() =>
              app.requireAuth(() => app.notify("Reaction recorded (demo)."))
            }
            onEditsClick={() =>
              app.notify("Edit history is not built in this demo.")
            }
          />
        )}
      </section>
    </div>
  );
}
