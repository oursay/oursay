"use client";

import Link from "next/link";
import { jurisdictionLabel } from "@/lib/mock";
import { relTime } from "@/lib/read-model";
import { jurisdictionPath } from "@/lib/routes";
import type { ActivityItem } from "@/lib/types";

/** Relative time plus an optional underlined jurisdiction link for activity rows. Prefers the served
 *  ISO `ts` (formatted live via relTime so it ticks + matches comment vocabulary); falls back to the
 *  pre-formatted `meta` string for mock/demo rows that carry no timestamp. */
export function ActivityRowMeta({ item, now }: { item: ActivityItem; now: Date }) {
  const jurId = item.jurisdictionId;
  const when = item.ts ? relTime(item.ts, now) : (item.meta ?? "");

  if (!jurId) {
    return <span className="block text-xs text-muted">{when}</span>;
  }

  return (
    <span className="block text-xs text-muted">
      {when}
      {" · "}
      <Link
        href={jurisdictionPath(jurId)}
        className="underline underline-offset-2 hover:text-ink"
      >
        {jurisdictionLabel(jurId)}
      </Link>
    </span>
  );
}
