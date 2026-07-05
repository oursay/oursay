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

function reactionUsesAltTone(item: ActivityItem): boolean {
  if (item.icon === "#ic-check-alt") return true;
  return /\bretract/.test(item.text.toLowerCase());
}

function reactionDirFromText(text: string): "up" | "down" | null {
  const lower = text.toLowerCase();
  if (/\bretract/.test(lower)) return "up";
  if (/\b(disagree|disagreed|changed to disagree)\b/.test(lower)) return "down";
  if (/\b(agree|agreed)\b/.test(lower)) return "up";
  return null;
}

/** Row glyph for a profile Activity item (wireframe `activityRow` icon map). */
export function activityRowGlyph(item: ActivityItem): ActivityRowGlyph {
  if (item.icon === "#ic-edit") return { type: "icon", icon: SquarePen };
  if (item.icon === "#ic-check") return { type: "reaction", dir: "up" };
  if (item.icon === "#ic-check-alt") return { type: "reaction", dir: "up", alt: true };
  if (item.icon === "#ic-x") return { type: "reaction", dir: "down" };

  if (item.kind === "reaction") {
    const dir = reactionDirFromText(item.text);
    if (dir) {
      return {
        type: "reaction",
        dir,
        alt: reactionUsesAltTone(item),
      };
    }
    return { type: "icon", icon: CheckCircle };
  }

  switch (item.kind) {
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
