"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Map, MessagesSquare, ScrollText } from "lucide-react";
import { getJurisdiction, listFeedItems } from "@/lib/api";
import type { FeedItem, JurisdictionSummary } from "@/lib/types";
import { Button, CollapsibleSection, FeedCard } from "@/components";
import { districtName } from "@/lib/mock";
import {
  districtPath,
  jurisdictionNameFromSlug,
  postPath,
  profilePath,
} from "@/lib/routes";
import { useApp } from "@/lib/state";

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function JurisdictionView({ slug }: { slug: string }) {
  const app = useApp();
  const router = useRouter();
  const name = jurisdictionNameFromSlug(slug);

  const [summary, setSummary] = useState<JurisdictionSummary | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ridingsOpen, setRidingsOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);

  useEffect(() => {
    app.setPageJurisdiction(name);
  }, [app, name]);

  useEffect(() => {
    getJurisdiction(name).then(setSummary);
  }, [name]);

  useEffect(() => {
    let active = true;
    listFeedItems({
      scope: "jurisdiction",
      filter: { ...app.feedFilter, jurisdiction: name },
      viewer: app.viewer,
    }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [app.feedFilter, app.viewer, name]);

  if (!summary) {
    return <p className="p-6 text-center text-sm text-muted">Jurisdiction not found.</p>;
  }

  const hasRidings = summary.districtLabel !== null && summary.districts.length > 0;

  return (
    <div className="space-y-4 p-4">
      <header className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-bold text-ink">{summary.name}</h2>
        <button
          type="button"
          // TODO(entityId): route to the jurisdiction leader's real profile.
          onClick={() => router.push(profilePath("raenguyen"))}
          className="mt-0.5 text-sm text-brand-700 underline underline-offset-2"
        >
          {summary.leader.name}
        </button>
      </header>

      {hasRidings ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-muted text-sm text-muted">
          <Map size={18} className="mr-2" aria-hidden />
          District map
        </div>
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
                <button
                  type="button"
                  // TODO(entityId): route to the riding by its real district id.
                  onClick={() => router.push(districtPath(slugify(d.name)))}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border px-3 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="font-medium text-ink">{d.name}</span>
                  <span className="text-xs text-muted">{d.leader}</span>
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

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
                item={{ ...item, sig: app.petitionSigFor(item) }}
                viewer={app.viewer}
                tierMin={app.state.verified}
                hideJur
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
