"use client";

import { useState } from "react";
import { Gavel, IdCard, MapPin, MapPinHouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TIER_LABEL } from "@/lib/types";
import type { PillDisplayMode, VerificationTier } from "@/lib/types";

/**
 * Glyph per verification type: Identity = ID badge · Residency = map pin ·
 * Official = gavel. A residency author in the viewer's own district upgrades to
 * the map-pin-house (see isHomeAuthor). Mirrors the wireframe's tierIcon().
 */
function tierIcon(tier: VerificationTier, home: boolean): LucideIcon {
  if (tier === 2 && home) return MapPinHouse;
  return [IdCard, IdCard, MapPin, Gavel][tier] ?? IdCard;
}

/** Background per verification type — distinct hues, not just shades. */
const TIER_BG: Record<Exclude<VerificationTier, 0>, string> = {
  1: "bg-verify-tier-1", // Identity — green
  2: "bg-verify-tier-2", // Residency — blue
  3: "bg-verify-tier-3", // Official — black
};

interface VerificationPillProps {
  tier: VerificationTier;
  /** Residency author in the viewer's district -> map-pin-house glyph. */
  isHomeAuthor?: boolean;
  mode?: PillDisplayMode;
  align?: "left" | "right";
}

/** Verification pill: glyph + label (full) or icon-only circle. Tier 0 renders nothing. */
export function VerificationPill({
  tier,
  isHomeAuthor = false,
  mode = "full",
  align = "left",
}: VerificationPillProps) {
  if (tier === 0) return null;
  const Icon = tierIcon(tier, isHomeAuthor);

  if (mode === "icon") {
    return <ExpandableVerificationPill tier={tier} Icon={Icon} align={align} />;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight text-white ${TIER_BG[tier]} ${align === "right" ? "ml-auto" : ""}`}
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
      className={`group inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-0 text-[10px] font-medium leading-tight text-white transition-[padding] ${TIER_BG[tier]} ${align === "right" ? "ml-auto" : ""} hover:px-1.5 data-[expanded]:px-1.5`}
    >
      <Icon size={10} aria-hidden className="shrink-0" />
      <span className="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline">
        {TIER_LABEL[tier]}
      </span>
    </button>
  );
}
