"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Map, Newspaper, ScrollText } from "lucide-react";
import { getJurisdiction, listFeedItems } from "@/lib/api";
import type { FeedItem, JurisdictionSummary } from "@/lib/types";
import {
  Button,
  CollapsibleSection,
  FeedCard,
  PlaceHeader,
  TitleLeaderRow,
} from "@/components";
import { districtName } from "@/lib/mock";
import {
  authorPath,
  districtPath,
  jurisdictionNameFromSlug,
  postPath,
  profilePath,
} from "@/lib/routes";
import { recordShareTarget } from "@/lib/share";
import { useApp } from "@/lib/state";

export function JurisdictionView({ slug }: { slug: string }) {
  const app = useApp();
  const { setPageJurisdiction, feedFilter, viewer } = app;
  const router = useRouter();
  const name = jurisdictionNameFromSlug(slug);

  const [summary, setSummary] = useState<JurisdictionSummary | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ridingsOpen, setRidingsOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);

  useEffect(() => {
    setPageJurisdiction(name);
  }, [name, setPageJurisdiction]);

  useEffect(() => {
    getJurisdiction(name).then(setSummary);
  }, [name]);

  useEffect(() => {
    let active = true;
    listFeedItems({
      scope: "jurisdiction",
      filter: { ...feedFilter, jurisdiction: name },
      viewer,
    }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [feedFilter, viewer, name]);

  if (!summary) {
    return <p className="p-6 text-center text-sm text-muted">Jurisdiction not found.</p>;
  }

  const hasRidings = summary.districtLabel !== null && summary.districts.length > 0;

  return (
    <div className="space-y-4 p-4">
      <PlaceHeader
        title={summary.name}
        leaderName={summary.leader.name}
        leaderHandle={summary.leader.handle}
        onLeaderClick={() => router.push(profilePath(summary.leader.handle))}
      />

      {hasRidings ? (
        <CollapsibleSection
          icon={Map}
          label="Map"
          open={mapOpen}
          onToggle={() => setMapOpen((v) => !v)}
        >
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted text-sm text-muted">
            <Map size={18} className="mr-2" aria-hidden />
            District map
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        icon={ScrollText}
        label="Rules"
        open={rulesOpen}
        onToggle={() => setRulesOpen((v) => !v)}
      >
        <ul className="space-y-1 text-sm text-ink-soft">
          {summary.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </CollapsibleSection>

      {hasRidings ? (
        <CollapsibleSection
          icon={Building2}
          label={summary.districtLabel ?? "Districts"}
          count={String(summary.districts.length)}
          open={ridingsOpen}
          onToggle={() => setRidingsOpen((v) => !v)}
        >
          <ul className="space-y-1.5">
            {summary.districts.map((d) => (
              <li key={d.name}>
                <div className="flex min-h-11 w-full items-center rounded-lg border border-border px-3 hover:bg-surface-muted">
                  <TitleLeaderRow
                    title={d.name}
                    leaderName={d.leader}
                    leaderHandle={d.leaderHandle}
                    variant="row"
                    onTitleClick={() => router.push(districtPath(d.slug))}
                    onLeaderClick={() => router.push(profilePath(d.leaderHandle))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

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
                onDistrictClick={(s) => router.push(districtPath(s))}
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
