"use client";

import type { ActivityItem } from "@/lib/types";
import {
  ACTIVITY_REACTION_TONE,
  REACTION_GLYPH,
  activityRowGlyph,
} from "./activityType";
import { ActivityRowMeta } from "./ActivityRowMeta";

interface ActivityRowProps {
  item: ActivityItem;
  /** Shared clock for live relative-time formatting (pass one `useNow()` per view, not per row). */
  now: Date;
  onOpen: () => void;
}

/** Profile/persona/official activity list row — record title and jurisdiction link stay separate interactives. */
export function ActivityRow({ item, now, onOpen }: ActivityRowProps) {
  const glyph = activityRowGlyph(item);

  return (
    <li className="rounded-lg border border-border bg-surface hover:bg-surface-muted">
      <div className="flex items-start gap-3 p-3">
        {glyph.type === "reaction" ? (
          <span
            aria-hidden
            className={`mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-sm font-bold leading-none ${
              glyph.alt ? ACTIVITY_REACTION_TONE.alt : ACTIVITY_REACTION_TONE.default
            }`}
          >
            {REACTION_GLYPH[glyph.dir]}
          </span>
        ) : (
          <glyph.icon size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="block w-full text-left text-sm text-ink">
            {item.text}
          </button>
          <ActivityRowMeta item={item} now={now} />
        </div>
      </div>
    </li>
  );
}
