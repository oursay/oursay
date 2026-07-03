"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRecordDetail, personaFor } from "@/lib/api";
import {
  COMMENT_MAX_DEPTH,
  type AuthorVisibility,
  type CommentNode,
  type RecordDetail,
  type RecordKind,
} from "@/lib/types";
import { relTime } from "@/lib/read-model";
import { GRADUATION_CHAIN, MY_HANDLE, NOW, districtName } from "@/lib/mock";
import {
  AnonymityDropdown,
  Button,
  CommentThread,
  PetitionProgress,
  PollOptions,
  RecordCard,
  RecordCardFooter,
  RecordCardHeader,
  RecordTypeSection,
  ReplyComposer,
  ResultOutcome,
  ScopeTag,
} from "@/components";
import { isHomeAuthor } from "@/components/utils";
import { authorPath, postPath, districtPath } from "@/lib/routes";
import { COMMENTS_SECTION_ID, scrollToCommentsSection } from "@/lib/scroll";
import { useApp } from "@/lib/state";

function countNodes(nodes: CommentNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.replies), 0);
}

export function PostView({ id, kind }: { id: string; kind: RecordKind }) {
  const app = useApp();
  const router = useRouter();
  const { setPageJurisdiction, setPostDistricts, viewer, feedFilter } = app;

  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [fullComments, setFullComments] = useState<CommentNode[]>([]);
  const [shownComments, setShownComments] = useState<CommentNode[]>([]);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  // Per-reply anonymity override (defaults to the account level; may widen or narrow).
  const [replyVisibility, setReplyVisibility] = useState<AuthorVisibility | undefined>();
  // Inline comment reply composers, keyed by node path — several open at once.
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());

  const toggleCommentReply = (nodePath: string) => {
    setOpenReplies((prev) => {
      const next = new Set(prev);
      if (next.has(nodePath)) next.delete(nodePath);
      else next.add(nodePath);
      return next;
    });
  };

  useEffect(() => {
    setDetail(null);
    setFullComments([]);
    setShownComments([]);
    let active = true;
    Promise.all([
      // The unfiltered fetch still carries the viewer — identity anonymization
      // applies to every read, only the comment refinements are skipped.
      getRecordDetail(id, { viewer }),
      getRecordDetail(id, { viewer, filter: feedFilter }),
    ]).then(([full, filtered]) => {
      if (!active || !full) return;
      setDetail(full.detail);
      setFullComments(full.comments);
      setShownComments(filtered?.comments ?? []);
      setPostDistricts(full.detail.districts);
    });
    return () => {
      active = false;
    };
  }, [id, viewer, feedFilter, setPostDistricts]);

  useEffect(() => {
    if (!detail) return;
    setPageJurisdiction(detail.jurisdiction);
    return () => setPageJurisdiction(null);
  }, [detail?.jurisdiction, setPageJurisdiction]);

  // Clear the geography post context when leaving the post (the conflict
  // auto-disable must not act on a stale post from list views).
  useEffect(() => () => setPostDistricts(null), [setPostDistricts]);

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
  const tierMin = app.effectiveVerified;

  const trueTotal = countNodes(fullComments);
  const hidden = trueTotal - countNodes(shownComments);

  const chainPetition = GRADUATION_CHAIN.petition;
  const chainPoll = GRADUATION_CHAIN.poll;
  const chainResult = GRADUATION_CHAIN.result;
  const petitionTarget = {
    id: chainPetition.id,
    jurisdiction: chainPetition.jurisdiction,
    title: chainPetition.title,
    sig: chainPetition.sig,
    districts: chainPetition.districts,
  };
  const petitionPreview = {
    title: chainPetition.title,
    sig: app.petitionSigFor(petitionTarget),
    goal: chainPetition.goal ?? 1,
  };

  const multiDistrict = detail.districts.length > 1;
  const scopeProps = {
    jurisdiction: detail.jurisdiction,
    districtSlugs: detail.districts,
    hideJur: true as const,
    resolveDistrict: districtName,
    expanded: scopeExpanded,
    onExpandToggle: () => setScopeExpanded((v) => !v),
    onDistrictClick: (slug: string) => router.push(districtPath(slug)),
  };

  const showChainLinks =
    detail.id === chainPetition.id ||
    detail.id === chainPoll.id ||
    detail.id === chainResult.id;

  return (
    <div className="space-y-4 p-4">
      <RecordCard
        variant="detail"
        header={
          <RecordCardHeader
            author={detail.author}
            handle={detail.handle}
            identity={detail.identity}
            tier={detail.tier}
            signTier={detail.signTier}
            isHomeAuthor={home}
            onAuthorClick={() => router.push(authorPath(detail.identity, detail.handle))}
            scopeSlot={
              detail.districts.length > 0 ? (
                <ScopeTag
                  {...scopeProps}
                  part={scopeExpanded && multiDistrict ? "head" : "all"}
                />
              ) : undefined
            }
            scopeContinuationSlot={
              scopeExpanded && multiDistrict ? (
                <ScopeTag {...scopeProps} part="tail" />
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
                <ResultOutcome options={detail.options} />
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
            signedPetition={
              detail.kind === "petition" ? app.hasSignedPetition(detail.id) : false
            }
            votedPoll={
              detail.kind === "poll" ? app.voteFor(detail.id) != null : false
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

      {showChainLinks ? (
        <RecordTypeSection
          detail={displayDetail}
          petitionPreview={petitionPreview}
          pollPreview={{ title: chainPoll.title, options: chainPoll.options ?? [] }}
          resultPreview={{ options: chainResult.options ?? [] }}
          onSeeFullPetition={() =>
            router.push(postPath("petition", chainPetition.id))
          }
          onSeeFullPoll={() => router.push(postPath("poll", chainPoll.id))}
          onSeeFullResult={() => router.push(postPath("result", chainResult.id))}
        />
      ) : null}

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
            <div className="flex items-center gap-2">
              <AnonymityDropdown
                size="compact"
                value={replyVisibility ?? app.state.accountVisibility}
                onChange={setReplyVisibility}
              />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setReplyVisibility(undefined);
                  app.closeReply();
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full!"
                onClick={() => {
                  const vis = replyVisibility ?? app.state.accountVisibility;
                  app.postComment(detail.jurisdiction, detail.title, () => {
                    setReplyVisibility(undefined);
                    app.closeReply();
                    app.notify(
                      vis === "public"
                        ? "Reply posted (demo)."
                        : `Reply posted (demo) — shown as ${personaFor(MY_HANDLE, detail.id)}.`,
                    );
                  });
                }}
              >
                Reply
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
            onReply={(_node, nodePath) => {
              if (openReplies.has(nodePath)) {
                toggleCommentReply(nodePath);
              } else {
                app.requireAuth(() => toggleCommentReply(nodePath));
              }
            }}
            renderReply={(node, nodePath, depth) =>
              openReplies.has(nodePath) ? (
                <div className="mt-2 pl-8">
                  <ReplyComposer
                    accountVisibility={app.state.accountVisibility}
                    initialText={
                      depth >= COMMENT_MAX_DEPTH ? `@${node.handle} ` : ""
                    }
                    autoFocus
                    onCancel={() => toggleCommentReply(nodePath)}
                    onSubmit={(_text, vis) => {
                      app.postComment(detail.jurisdiction, detail.title, () => {
                        toggleCommentReply(nodePath);
                        app.notify(
                          vis === "public"
                            ? "Reply posted (demo)."
                            : `Reply posted (demo) — shown as ${personaFor(MY_HANDLE, detail.id)}.`,
                        );
                      });
                    }}
                  />
                </div>
              ) : null
            }
            onAuthorClick={(node) => router.push(authorPath(node.identity, node.handle))}
            onReact={() => app.reactComment(detail.jurisdiction, detail.title)}
            onEditsClick={() =>
              app.notify("Edit history is not built in this demo.")
            }
          />
        )}
      </section>
    </div>
  );
}
