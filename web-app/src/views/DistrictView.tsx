"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Map, Newspaper } from "lucide-react";
import { getDistrict, listFeedItems } from "@/lib/api";
import type { DistrictDetail, FeedItem } from "@/lib/types";
import { Button, CollapsibleSection, FeedCard, PlaceHeader } from "@/components";
import { districtName } from "@/lib/mock";
import { authorPath, postPath, profilePath, jurisdictionPath } from "@/lib/routes";
import { recordShareTarget } from "@/lib/share";
import { useApp } from "@/lib/state";

export function DistrictView({ slug }: { slug: string }) {
  const app = useApp();
  const { setPageJurisdiction, feedFilter, viewer } = app;
  const router = useRouter();

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);

  useEffect(() => {
    getDistrict(slug).then(setDetail);
  }, [slug]);

  useEffect(() => {
    if (detail) setPageJurisdiction(detail.jur);
  }, [detail?.jur, setPageJurisdiction]);

  useEffect(() => {
    let active = true;
    listFeedItems({
      scope: "district",
      filter: { ...feedFilter, districtSlug: slug },
      viewer,
    }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [feedFilter, viewer, slug]);

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
            {detail.jur}
          </button>
        }
        leaderName={detail.leader}
        leaderHandle={detail.leaderHandle}
        onLeaderClick={() => router.push(profilePath(detail.leaderHandle))}
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
        count={items ? String(items.length) : undefined}
        open={feedOpen}
        onToggle={() => setFeedOpen((v) => !v)}
      >
        <div className="space-y-3">
          {items === null ? (
            <p className="py-4 text-center text-sm text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              No records match the current filters.
            </p>
          ) : (
            items.map((item) => (
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
                  app.notify("Edit history is not built in this demo.")
                }
              />
            ))
          )}
        </div>
      </CollapsibleSection>

      <Button variant="ghost" size="sm" onClick={() => router.push("/feed")}>
        View posts in Feed
      </Button>
    </div>
  );
}
