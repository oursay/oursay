"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Map, MessagesSquare } from "lucide-react";
import { getDistrict, listFeedItems } from "@/lib/api";
import type { DistrictDetail, FeedItem } from "@/lib/types";
import { Button, CollapsibleSection, FeedCard } from "@/components";
import { districtName } from "@/lib/mock";
import { postPath, profilePath } from "@/lib/routes";
import { useApp } from "@/lib/state";

export function DistrictView({ slug }: { slug: string }) {
  const app = useApp();
  const router = useRouter();

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);

  useEffect(() => {
    getDistrict(slug).then(setDetail);
  }, [slug]);

  useEffect(() => {
    if (detail) app.setPageJurisdiction(detail.jur);
  }, [app, detail]);

  useEffect(() => {
    let active = true;
    listFeedItems({
      scope: "district",
      filter: { ...app.feedFilter, districtSlug: slug },
      viewer: app.viewer,
    }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [app.feedFilter, app.viewer, slug]);

  if (!detail) {
    return <p className="p-6 text-center text-sm text-muted">District not found.</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <header className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-bold text-ink">{detail.name}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {detail.jur} ·{" "}
          <button
            type="button"
            // TODO(entityId): route to the riding representative's real profile.
            onClick={() => router.push(profilePath("raenguyen"))}
            className="text-brand-700 underline underline-offset-2"
          >
            {detail.leader}
          </button>
        </p>
      </header>

      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted text-sm text-muted">
        <Map size={18} className="mr-2" aria-hidden />
        Riding boundary ({detail.boundaryYear} · {detail.source})
      </div>

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
        icon={MessagesSquare}
        label="Posts"
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
                tierMin={app.state.verified}
                hideJur
                hideDistrict
                resolveDistrict={districtName}
                onAuthorClick={() => router.push(profilePath(item.handle))}
                onTitleClick={() => router.push(postPath(item.kind))}
                onCommentsClick={() =>
                  router.push(postPath(item.kind, { comments: true }))
                }
                onReact={(dir) => app.react(item, dir)}
                selectedReaction={app.reactionFor(item.id)}
                selectedVote={app.voteFor(item.id)}
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
