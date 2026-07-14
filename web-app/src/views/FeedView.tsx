"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { listFeedItems } from "@/lib/api";
import type { FeedItem } from "@/lib/types";
import { FeedCard } from "@/components";
import { InfiniteScrollFooter, InfiniteScrollSentinel } from "@/components/utils";
import { districtName } from "@/lib/mock";
import { authorPath, districtPath, jurisdictionPath, personaHintPath, postPath } from "@/lib/routes";
import { recordShareTarget } from "@/lib/share";
import { useApp } from "@/lib/state";
import { useCursorInfiniteList } from "@/lib/hooks/useCursorInfiniteList";
import { DEFERRED_EDIT_HISTORY } from "@/lib/api/deferred";

export function FeedView() {
  const app = useApp();
  const { setPageJurisdiction, feedFilter, viewer, hydrateRecordState } = app;
  const router = useRouter();

  useEffect(() => {
    setPageJurisdiction(null);
  }, [setPageJurisdiction]);

  const resetKey = useMemo(
    () => JSON.stringify({ feedFilter, viewer }),
    [feedFilter, viewer],
  );

  const fetchPage = useCallback(
    (cursor: string | null) =>
      listFeedItems({ scope: "feed", filter: feedFilter, viewer, cursor }),
    [feedFilter, viewer],
  );

  const { items, loading, loadingMore, hasMore, error, loadMore } =
    useCursorInfiniteList<FeedItem>({
      resetKey,
      fetchPage,
      getItemId: (item) => item.id,
      onItemsChange: (rows) => hydrateRecordState(rows.map((r) => r.id)),
    });

  if (loading && items.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">Loading feed…</p>;
  }
  if (!loading && items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted">
        No records match the current filters.
      </p>
    );
  }

  const hideJur =
    app.state.subscriptions.filter((s) => s.included).length <= 1;

  return (
    <div className="space-y-3 px-3 py-3">
      {items.map((item) => {
        const personaHint = personaHintPath(item.identity);
        return (
        // TODO(entityId): representative-target nav — route by record/profile id.
        <FeedCard
          key={item.id}
          item={{
            ...item,
            sig: app.petitionSigFor(item),
            ...app.reactionCountsFor(item),
          }}
          viewer={app.viewer}
          tierMin={app.effectiveVerified}
          hideJur={hideJur}
          resolveDistrict={districtName}
          onAuthorClick={() => router.push(authorPath(item.identity, item.handle))}
          onPersonaClick={
            personaHint ? () => router.push(personaHint) : undefined
          }
          onTitleClick={() => router.push(postPath(item.kind, item.id))}
          onCommentsClick={() =>
            router.push(postPath(item.kind, item.id, { comments: true }))
          }
          onShare={() => app.openShare(recordShareTarget(item))}
          shareCount={app.shareCountFor(item.id)}
          shared={app.hasShared(item.id)}
          onReact={(dir) => app.react(item, dir)}
          selectedReaction={app.reactionFor(item.id)}
          selectedVote={app.voteFor(item.id)}
          signedPetition={app.hasSignedPetition(item.id)}
          onVote={(label) => app.votePoll(item, label)}
          onSignPetition={() => app.signPetition(item)}
          onEditsClick={() => app.notify(DEFERRED_EDIT_HISTORY)}
          onJurisdictionClick={() =>
            router.push(jurisdictionPath(item.jurisdiction))
          }
          onDistrictClick={(slug) => router.push(districtPath(slug))}
        />
        );
      })}
      <InfiniteScrollFooter
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
      />
      <InfiniteScrollSentinel
        onVisible={loadMore}
        disabled={!hasMore || loading || loadingMore}
        watchKey={items.length}
      />
    </div>
  );
}
