import {
  ChartNoAxesColumn,
  CheckCircle,
  CircleCheckBig,
  ClipboardPenLine,
  MessageSquare,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@/lib/types";
import { RECORD_TYPE_ICON } from "./recordType";

/** Votes filter glyph in the profile filter dropdown. */
export const ACTIVITY_POLL_ICON: LucideIcon = ChartNoAxesColumn;

/** Vote rows in the profile Activity tab. */
export const ACTIVITY_VOTE_ICON: LucideIcon = CircleCheckBig;

export const ALL_ACTIVITY_KINDS: ActivityKind[] = [
  "statement",
  "comment",
  "petition",
  "poll",
  "reaction",
];

/** Profile Activity-tab filter labels and icons (distinct from feed record kinds). */
export const ACTIVITY_TYPE_META: Record<ActivityKind, { icon: LucideIcon; label: string }> = {
  statement: { icon: RECORD_TYPE_ICON.statement, label: "Statements" },
  comment: { icon: MessageSquare, label: "Comments" },
  petition: { icon: ClipboardPenLine, label: "Petitions" },
  poll: { icon: ACTIVITY_POLL_ICON, label: "Votes" },
  reaction: { icon: CheckCircle, label: "Reactions" },
};

export type ActivityRowGlyph =
  | { type: "icon"; icon: LucideIcon }
  | { type: "reaction"; dir: "up" | "down"; alt?: boolean };

/** Primary vs alternate tone for ✓/✗ activity glyphs. */
export const ACTIVITY_REACTION_TONE = {
  default: "text-brand-600",
  alt: "text-brand-300",
} as const;

/** Row glyph for a profile Activity item. Reaction direction/tone comes from the server- (or mock-)
 *  set `item.icon` id — never re-derived from the display text. Every producer stamps `item.icon`
 *  (`#ic-check` agree · `#ic-x` disagree · `#ic-check-alt` retract · `#ic-edit`), so the old
 *  text-regex fallback was dead and brittle (broke on any copy change / non-English text). */
export function activityRowGlyph(item: ActivityItem): ActivityRowGlyph {
  if (item.icon === "#ic-edit") return { type: "icon", icon: SquarePen };
  if (item.icon === "#ic-check") return { type: "reaction", dir: "up" };
  if (item.icon === "#ic-check-alt") return { type: "reaction", dir: "up", alt: true };
  if (item.icon === "#ic-x") return { type: "reaction", dir: "down" };

  switch (item.kind) {
    case "reaction":
      // Reaction with no recognized icon id — shouldn't happen (all producers set one); neutral glyph.
      return { type: "icon", icon: CheckCircle };
    case "comment":
      return { type: "icon", icon: MessageSquare };
    case "petition":
      return { type: "icon", icon: ClipboardPenLine };
    case "poll":
      return { type: "icon", icon: ACTIVITY_VOTE_ICON };
    case "statement":
    default:
      return { type: "icon", icon: RECORD_TYPE_ICON.statement };
  }
}

/** Bold ✓/✗ labels matching ReactionButtons. */
export const REACTION_GLYPH: Record<"up" | "down", string> = {
  up: "✓",
  down: "✗",
};
