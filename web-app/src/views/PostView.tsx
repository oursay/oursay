"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRecordDetail, personaFor } from "@/lib/api";
import {
  COMMENT_MAX_DEPTH,
  VISIBILITY_LABEL,
  type AuthorVisibility,
  type CommentNode,
  type RecordDetail,
  type RecordKind,
} from "@/lib/types";
import { relTime } from "@/lib/read-model";
import { GRADUATION_CHAIN, MY_HANDLE, NOW, districtName } from "@/lib/mock";
import {
  AnonymityConfirmModal,
  AnonymityDropdown,
  Button,
  CommentCountPill,
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
import { authorPath, postPath, districtPath } from "@/lib/routes";
import { commentKey, commentShareTarget, recordShareTarget } from "@/lib/share";
import { COMMENTS_SECTION_ID, scrollToCommentsSection } from "@/lib/scroll";
import {
  readThreadVisibilities,
  useApp,
  writeThreadVisibility,
} from "@/lib/state";

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
  // Thread-wide anonymity: chosen once beside the Comments heading and reused by
  // every reply in this post's thread. Undefined until touched, so it tracks the
  // account default (§ anonymity is thread-bound, not reply-bound).
  const [threadVisibility, setThreadVisibility] = useState<AuthorVisibility | undefined>();
  // Pending change awaiting confirmation (anonymity change is gated by a modal).
  const [pendingVisibility, setPendingVisibility] = useState<AuthorVisibility | null>(null);
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

  // Restore this post's remembered thread anonymity (demo cookie memory).
  useEffect(() => {
    setPendingVisibility(null);
    setThreadVisibility(readThreadVisibilities()[id]);
  }, [id]);

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
  const isFinal = detail.jurisdiction === "Alberta";
  const tierMin = app.effectiveVerified;
  // Effective anonymity for anything the viewer posts in this thread.
  const threadVis = threadVisibility ?? app.state.accountVisibility;

  const trueTotal = countNodes(fullComments);
  const hidden = trueTotal - countNodes(shownComments);

  // Comment reactions reuse the record reaction machinery, keyed by a stable
  // per-comment id so counts/selection survive re-fetches and filter reordering.
  const commentTarget = (node: CommentNode) => ({
    id: commentKey(detail.id, node),
    jurisdiction: detail.jurisdiction,
    title: detail.title,
    up: node.up,
    down: node.down,
    districts: detail.districts,
  });

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
            authorGeo={detail.authorGeo}
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
            edits={detail.edits}
            tierMin={tierMin}
            onReact={(dir) => app.react(target, dir)}
            onReply={app.startReply}
            onEditsClick={() => app.notify("Edit history is not built in this demo.")}
            onShare={() => app.openShare(recordShareTarget(detail))}
            shareCount={app.shareCountFor(detail.id)}
            shared={app.hasShared(detail.id)}
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              Comments
            </h2>
            <CommentCountPill count={trueTotal - hidden} hidden={hidden} />
          </div>
          {/* One anonymity control for the whole thread — every reply here posts
              under this identity (defaults to the account setting). */}
          <div className="shrink-0">
            <AnonymityDropdown
              size="compact"
              value={threadVis}
              onChange={(v) =>
                setPendingVisibility(v === threadVis ? null : v)
              }
            />
          </div>
        </div>

        {app.state.replyOpen ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <textarea
              rows={3}
              placeholder="Write a reply…"
              className="w-full rounded-md border border-border bg-surface-muted px-2.5 py-2 text-sm text-ink placeholder:text-muted"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => app.closeReply()}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-full!"
                onClick={() => {
                  app.postComment(detail.jurisdiction, detail.title, () => {
                    app.closeReply();
                    app.notify(
                      threadVis === "public"
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
                    initialText={
                      depth >= COMMENT_MAX_DEPTH ? `@${node.handle} ` : ""
                    }
                    autoFocus
                    onCancel={() => toggleCommentReply(nodePath)}
                    onSubmit={() => {
                      app.postComment(detail.jurisdiction, detail.title, () => {
                        toggleCommentReply(nodePath);
                        app.notify(
                          threadVis === "public"
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
            onReact={(node, dir) => app.react(commentTarget(node), dir)}
            reactionCountsFor={(node) => app.reactionCountsFor(commentTarget(node))}
            selectedReactionFor={(node) =>
              app.reactionFor(commentKey(detail.id, node))
            }
            onEditsClick={() =>
              app.notify("Edit history is not built in this demo.")
            }
            onShare={(node, _path, depth) =>
              app.openShare(
                commentShareTarget(
                  node,
                  detail.kind,
                  detail.id,
                  relTime(node.ts, NOW),
                  depth,
                ),
              )
            }
            shareCountFor={(node) =>
              app.shareCountFor(commentKey(detail.id, node))
            }
            sharedFor={(node) => app.hasShared(commentKey(detail.id, node))}
          />
        )}
      </section>

      <AnonymityConfirmModal
        open={pendingVisibility !== null}
        pending={pendingVisibility}
        onCancel={() => setPendingVisibility(null)}
        onConfirm={() => {
          if (pendingVisibility === null) return;
          setThreadVisibility(pendingVisibility);
          writeThreadVisibility(detail.id, pendingVisibility);
          setPendingVisibility(null);
          app.notify(
            `Thread anonymity set to ${VISIBILITY_LABEL[pendingVisibility]}.`,
          );
        }}
      />
    </div>
  );
}
