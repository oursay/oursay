"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listFeedItems } from "@/lib/api";
import type { FeedItem } from "@/lib/types";
import { FeedCard } from "@/components";
import { districtName } from "@/lib/mock";
import { districtPath, jurisdictionPath, postPath, profilePath } from "@/lib/routes";
import { useApp } from "@/lib/state";

export function FeedView() {
  const app = useApp();
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    app.setPageJurisdiction(null);
  }, [app]);

  useEffect(() => {
    let active = true;
    listFeedItems({ scope: "feed", filter: app.feedFilter, viewer: app.viewer }).then(
      (rows) => {
        if (active) setItems(rows);
      },
    );
    return () => {
      active = false;
    };
  }, [app.feedFilter, app.viewer]);

  if (items === null) {
    return <p className="p-6 text-center text-sm text-muted">Loading feed…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted">
        No records match the current filters.
      </p>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {items.map((item) => (
        // TODO(entityId): representative-target nav — route by record/profile id.
        <FeedCard
          key={item.id}
          item={{ ...item, sig: app.petitionSigFor(item) }}
          viewer={app.viewer}
          tierMin={app.state.verified}
          resolveDistrict={districtName}
          onAuthorClick={() => router.push(profilePath(item.handle))}
          onTitleClick={() => router.push(postPath(item.kind))}
          onCommentsClick={() => router.push(postPath(item.kind))}
          onReact={(dir) => app.react(item, dir)}
          onEditsClick={() => app.notify("Edit history is not built in this demo.")}
          onJurisdictionClick={() =>
            router.push(jurisdictionPath(item.jurisdiction))
          }
          onDistrictClick={(slug) => router.push(districtPath(slug))}
        />
      ))}
    </div>
  );
}
