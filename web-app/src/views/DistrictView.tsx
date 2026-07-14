"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Map, Newspaper } from "lucide-react";
import { getDistrict, listFeedItems } from "@/lib/api";
import type { DistrictDetail, FeedItem } from "@/lib/types";
import { Button, CollapsibleSection, FeedCard, PlaceHeader } from "@/components";
import { InfiniteScrollFooter, InfiniteScrollSentinel } from "@/components/utils";
import { districtName, jurisdictionIdFromSlug, jurisdictionLabel } from "@/lib/mock";
import { isSeatClaimed } from "@/lib/official-seat";
import { authorPath, personaHintPath, postPath, officialPath, jurisdictionPath } from "@/lib/routes";
import { recordShareTarget } from "@/lib/share";
import { useApp } from "@/lib/state";
import { useCursorInfiniteList } from "@/lib/hooks/useCursorInfiniteList";
import { DEFERRED_EDIT_HISTORY } from "@/lib/api/deferred";

export function DistrictView({
  slug,
  jurisdictionSlug,
}: {
  slug: string;
  jurisdictionSlug?: string;
}) {
  const app = useApp();
  const { setPageJurisdiction, feedFilter, viewer } = app;
  const router = useRouter();
  const jurisdictionId = jurisdictionSlug
    ? (jurisdictionIdFromSlug(jurisdictionSlug) ?? jurisdictionSlug)
    : undefined;

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);

  const resetKey = useMemo(
    () => JSON.stringify({ feedFilter, viewer, slug }),
    [feedFilter, viewer, slug],
  );

  const fetchPage = useCallback(
    (cursor: string | null) =>
      listFeedItems({
        scope: "district",
        filter: { ...feedFilter, districtSlug: slug },
        viewer,
        cursor,
      }),
    [feedFilter, viewer, slug],
  );

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    total,
    loadMore,
  } = useCursorInfiniteList<FeedItem>({
    resetKey,
    fetchPage,
    getItemId: (item) => item.id,
    enabled: feedOpen,
    onItemsChange: (rows) => app.hydrateRecordState(rows.map((r) => r.id)),
  });

  useEffect(() => {
    getDistrict(slug, jurisdictionId ? { jurisdictionId } : undefined).then(setDetail);
  }, [slug, jurisdictionId]);

  useEffect(() => {
    if (detail) setPageJurisdiction(detail.jur);
  }, [detail?.jur, setPageJurisdiction]);

  if (!detail) {
    return <p className="p-6 text-center text-sm text-muted">District not found.</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <PlaceHeader
        title={detail.name}
        subtitle={
          <button
            type="button"
            onClick={() => router.push(jurisdictionPath(detail.jur))}
            className="underline underline-offset-2 hover:text-ink-soft"
          >
            {jurisdictionLabel(detail.jur)}
          </button>
        }
        leaderName={detail.leader}
        leaderHandle={detail.leaderHandle}
        claimedUserHandle={detail.claimedUserHandle}
        claimed={detail.leaderClaimed ?? isSeatClaimed(detail.leaderHandle)}
        leaderRole="mla"
        onLeaderClick={() => {
          const path = officialPath(detail.leaderHandle);
          if (path) router.push(path);
        }}
      />

      <CollapsibleSection
        icon={Map}
        label="Map"
        open={mapOpen}
        onToggle={() => setMapOpen((v) => !v)}
      >
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted text-sm text-muted">
          <Map size={18} className="mr-2" aria-hidden />
          Riding boundary ({detail.boundaryYear} · {detail.source})
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={Info}
        label="About"
        open={aboutOpen}
        onToggle={() => setAboutOpen((v) => !v)}
      >
        <ul className="space-y-1 text-sm text-ink-soft">
          {detail.about.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        icon={Newspaper}
        label="Feed"
        count={
          total != null
            ? String(total)
            : items.length > 0 || loading
              ? String(items.length)
              : undefined
        }
        open={feedOpen}
        onToggle={() => setFeedOpen((v) => !v)}
      >
        <div className="space-y-3">
          {loading && items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              No records match the current filters.
            </p>
          ) : (
            items.map((item) => {
              const personaHint = personaHintPath(item.identity);
              return (
              <FeedCard
                key={item.id}
                item={{
                  ...item,
                  sig: app.petitionSigFor(item),
                  ...app.reactionCountsFor(item),
                }}
                viewer={app.viewer}
                tierMin={app.effectiveVerified}
                hideJur
                hideDistrict
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
                onEditsClick={() =>
                  app.notify(DEFERRED_EDIT_HISTORY)
                }
              />
              );
            })
          )}
          <InfiniteScrollFooter
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={hasMore}
            empty={items.length === 0}
          />
          <InfiniteScrollSentinel
            onVisible={loadMore}
            disabled={!feedOpen || !hasMore || loading || loadingMore}
            watchKey={items.length}
          />
        </div>
      </CollapsibleSection>

      <Button variant="ghost" size="sm" onClick={() => router.push("/feed")}>
        View posts in Feed
      </Button>
    </div>
  );
}
