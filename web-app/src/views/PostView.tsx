"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight } from "lucide-react";
import { getRecordDetail } from "@/lib/api";
import type { CommentNode, RecordDetail, RecordKind } from "@/lib/types";
import {
  postQualifiesForAffected,
  relTime,
} from "@/lib/read-model";
import {
  NOW,
  POST_PETITION,
  POST_POLL,
  POST_RESULT,
  districtName,
} from "@/lib/mock";
import {
  AuthorRow,
  Button,
  CommentThread,
  EditCountLink,
  PetitionProgress,
  PollOptions,
  ReactionButtons,
  RecordTypeSection,
  ScopeTag,
} from "@/components";
import { formatCount, isHomeAuthor } from "@/components/utils";
import { postPath, profilePath, jurisdictionPath, districtPath } from "@/lib/routes";
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
    app.setPageJurisdiction(null);
  }, [app]);

  useEffect(() => {
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

  if (!detail) {
    return <p className="p-6 text-center text-sm text-muted">Record not found.</p>;
  }

  const target = {
    id: detail.id,
    jurisdiction: detail.jurisdiction,
    title: detail.title,
    sig: detail.sig,
    districts: detail.districts,
  };
  const sig = app.petitionSigFor(target);
  const displayDetail: RecordDetail =
    detail.kind === "petition" ? { ...detail, sig } : detail;
  const home = isHomeAuthor(detail.districts, app.viewer.kycTier, app.viewer.viewerDistricts);
  const isFinal = detail.jurisdiction === "Alberta";

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
      <article className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <AuthorRow
            author={detail.author}
            handle={detail.handle}
            tier={detail.tier}
            isHomeAuthor={home}
            layout="card"
            // TODO(entityId): route to the author's real profile.
            onAuthorClick={() => router.push(profilePath(detail.handle))}
          />
        </div>

        <div className="flex justify-end">
          <ScopeTag
            jurisdiction={detail.jurisdiction}
            districtSlugs={detail.districts}
            resolveDistrict={districtName}
            onJurisdictionClick={() =>
              router.push(jurisdictionPath(detail.jurisdiction))
            }
            onDistrictClick={(slug) => router.push(districtPath(slug))}
          />
        </div>

        <div>
          <h1 className="text-lg font-bold text-ink">{detail.title}</h1>
          <p className="mt-0.5 text-xs text-muted">{relTime(detail.ts, NOW)}</p>
        </div>

        <div className="space-y-1 text-sm text-ink-soft">
          {detail.body.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {detail.kind === "petition" ? (
          <PetitionProgress
            sig={sig}
            goal={detail.goal ?? 1}
            attachedPoll={detail.attachedPoll}
            tierMin={app.state.verified}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => app.signPetition(target)}
            >
              Sign the Petition
            </Button>
          </PetitionProgress>
        ) : null}

        {detail.kind === "poll" && detail.options ? (
          <PollOptions
            options={detail.options}
            selectedVote={app.voteFor(detail.id)}
            isFinalJurisdiction={isFinal}
            tierMin={app.state.verified}
            onVote={(label) => app.votePoll(target, label)}
          />
        ) : null}

        {detail.kind === "result" && detail.options ? (
          <PollOptions options={detail.options} frozen tierMin={app.state.verified} />
        ) : null}

        {/* Unified bottom bar: reactions or civic count + reply + edits + comments. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          {detail.kind === "statement" || detail.kind === "result" ? (
            <ReactionButtons
              up={detail.up ?? 0}
              down={detail.down ?? 0}
              selected={app.reactionFor(detail.id)}
              scale="detail"
              onReact={(dir) => app.react(target, dir)}
            />
          ) : null}
          {detail.kind === "petition" ? (
            <span className="text-sm text-ink-soft">
              {formatCount(sig)} signatures
            </span>
          ) : null}
          {detail.kind === "poll" && detail.options ? (
            <span className="text-sm text-ink-soft">
              {formatCount(detail.options.reduce((a, o) => a + o.v, 0))} votes
            </span>
          ) : null}

          <button
            type="button"
            onClick={app.startReply}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink-soft"
          >
            <CornerDownRight size={14} aria-hidden />
            Reply
          </button>
          <EditCountLink
            count={detail.edits}
            onClick={() => app.notify("Edit history is not built in this demo.")}
          />
          <span className="ml-auto text-sm text-muted">
            {formatCount(trueTotal)} comments
          </span>
        </div>
      </article>

      {/* TODO(entityId): interlink to the linked records by their real ids. */}
      <RecordTypeSection
        detail={displayDetail}
        petitionPreview={petitionPreview}
        pollPreview={{ title: POST_POLL.title, options: POST_POLL.options ?? [] }}
        resultPreview={{ options: POST_RESULT.options ?? [] }}
        onSeeFullPetition={() => router.push(postPath("petition"))}
        onSeeFullPoll={() => router.push(postPath("poll"))}
        onSeeFullResult={() => router.push(postPath("result"))}
      />

      <section className="space-y-3">
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
            tierMin={app.state.verified}
            onReply={app.startReply}
            // TODO(entityId): route to the commenter's real profile.
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
