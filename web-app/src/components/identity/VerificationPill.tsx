import { Gavel, IdCard, MapPin, MapPinHouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TIER_LABEL } from "@/lib/types";
import type { VerificationTier } from "@/lib/types";

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
  align?: "left" | "right";
}

/** Tight verification pill: glyph + label. Tier 0 (public) renders nothing. */
export function VerificationPill({
  tier,
  isHomeAuthor = false,
  align = "left",
}: VerificationPillProps) {
  if (tier === 0) return null;
  const Icon = tierIcon(tier, isHomeAuthor);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${TIER_BG[tier]} ${align === "right" ? "ml-auto" : ""}`}
    >
      <Icon size={12} aria-hidden />
      {TIER_LABEL[tier]}
    </span>
  );
}
