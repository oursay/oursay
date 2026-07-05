"use client";

import { useState } from "react";
import { Gavel, IdCard, MapPin, MapPinCheck, MapPinHouse, MapPinned } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TIER_LABEL } from "@/lib/types";
import type {
  AuthorGeoRelation,
  PillDisplayMode,
  VerificationTier,
} from "@/lib/types";

/**
 * Only Residency (tier 2) has a spatial relationship to show; every other tier
 * ignores authorGeo. The relation is server-resolved (see AuthorGeoRelation in
 * lib/types — raw author districts never reach the client):
 *
 * - "none"         residency-verified, no contextual relation  -> map-pin
 * - "home"         in one of the VIEWER's home districts        -> map-pin-house
 * - "affected"     resident of the OPEN POST's affected area    -> map-pin-check
 * - "jurisdiction" in the post's jurisdiction but OUTSIDE its   -> map-pinned
 *                  affected area (drops off on jurisdiction-wide
 *                  posts, where everyone is "affected")
 */
export type { AuthorGeoRelation };

/** Residency glyph refined by the author's spatial relation to the context. */
const RESIDENCY_GEO_ICON: Record<AuthorGeoRelation, LucideIcon> = {
  none: MapPin,
  home: MapPinHouse,
  affected: MapPinCheck,
  jurisdiction: MapPinned,
};

/**
 * Glyph per verification type: Identity = ID badge · Residency = map pin ·
 * Official = gavel. Residency refines by the author's spatial relation to the
 * context (see AuthorGeoRelation). Mirrors the wireframe's tierIcon().
 */
function tierIcon(tier: VerificationTier, geo: AuthorGeoRelation): LucideIcon {
  if (tier === 2) return RESIDENCY_GEO_ICON[geo];
  return [IdCard, IdCard, MapPin, Gavel][tier] ?? IdCard;
}

/** Background per verification type — distinct hues, not just shades. */
const TIER_BG: Record<Exclude<VerificationTier, 0>, string> = {
  1: "bg-verify-tier-1", // Identity — green
  2: "bg-verify-tier-2", // Residency — blue
  3: "bg-verify-tier-3", // Official — black (light) / near-white (dark)
};

/**
 * Foreground per tier. Identity/Residency keep white text on their saturated
 * fills in both themes; Official's fill inverts (black↔near-white), so it uses
 * `paper` — the exact inverse of `ink` — to stay legible on either.
 */
const TIER_FG: Record<Exclude<VerificationTier, 0>, string> = {
  1: "text-white",
  2: "text-white",
  3: "text-paper",
};

interface VerificationPillProps {
  tier: VerificationTier;
  /** A Residency author's spatial relation to the context, refining the tier-2 glyph. */
  authorGeo?: AuthorGeoRelation;
  mode?: PillDisplayMode;
  align?: "left" | "right";
}

/** Verification pill: glyph + label (full) or icon-only circle. Tier 0 renders nothing. */
export function VerificationPill({
  tier,
  authorGeo = "none",
  mode = "full",
  align = "left",
}: VerificationPillProps) {
  if (tier === 0) return null;
  const Icon = tierIcon(tier, authorGeo);

  if (mode === "icon") {
    return <ExpandableVerificationPill tier={tier} Icon={Icon} align={align} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight ${TIER_FG[tier]} ${TIER_BG[tier]} ${align === "right" ? "ml-auto" : ""}`}
    >
      <Icon size={10} aria-hidden />
      {TIER_LABEL[tier]}
    </span>
  );
}

interface ExpandableVerificationPillProps {
  tier: Exclude<VerificationTier, 0>;
  Icon: LucideIcon;
  align: "left" | "right";
}

/**
 * Icon-only verification pill that reveals its full label on hover (pointer)
 * or tap (touch). Full-form pills are static; only the icon variant expands.
 */
function ExpandableVerificationPill({ tier, Icon, align }: ExpandableVerificationPillProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      aria-label={TIER_LABEL[tier]}
      aria-expanded={expanded}
      data-expanded={expanded || undefined}
      onClick={(e) => {
        // Keep the pill self-contained inside clickable cards.
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      onMouseLeave={() => setExpanded(false)}
      onBlur={() => setExpanded(false)}
      className={`group inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-0 text-[10px] font-medium leading-tight transition-[padding] ${TIER_FG[tier]} ${TIER_BG[tier]} ${align === "right" ? "ml-auto" : ""} hover:px-1.5 data-[expanded]:px-1.5`}
    >
      <Icon size={10} aria-hidden className="shrink-0" />
      <span className="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline">
        {TIER_LABEL[tier]}
      </span>
    </button>
  );
}
