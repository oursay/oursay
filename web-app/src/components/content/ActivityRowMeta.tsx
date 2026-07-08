"use client";

import Link from "next/link";
import { jurisdictionLabel } from "@/lib/mock";
import { jurisdictionPath } from "@/lib/routes";
import type { ActivityItem } from "@/lib/types";

/** Relative time plus an optional underlined jurisdiction link for activity rows. */
export function ActivityRowMeta({ item }: { item: ActivityItem }) {
  const jurId = item.jurisdictionId;

  if (!jurId) {
    return <span className="block text-xs text-muted">{item.meta}</span>;
  }

  return (
    <span className="block text-xs text-muted">
      {item.meta}
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
