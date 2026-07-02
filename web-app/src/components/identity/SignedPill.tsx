"use client";

import { useState } from "react";
import { Fingerprint, Key, ScanFace } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PillDisplayMode, SignIconVariant, SignTier } from "@/lib/types";
import { showsSignedPill, signIconVariant } from "@/lib/types/sign-tier";

const ICON_BY_VARIANT: Record<SignIconVariant, LucideIcon> = {
  key: Key,
  fingerprint: Fingerprint,
  face: ScanFace,
};

interface SignedPillProps {
  signTier?: SignTier;
  mode: PillDisplayMode;
}

/**
 * Signed pill — label always "Signed" (passkey-signed class). Renders for
 * signTier ≥ 1; tier 0 (derived-key) renders nothing. Icon follows signTier.
 */
export function SignedPill({ signTier, mode }: SignedPillProps) {
  if (!showsSignedPill(signTier)) return null;

  const variant = signIconVariant(signTier);
  if (!variant) return null;
  const Icon = ICON_BY_VARIANT[variant];

  if (mode === "icon") {
    return <ExpandableSignedPill Icon={Icon} />;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-800 px-1.5 py-px text-[10px] font-medium leading-tight text-white">
      <Icon size={10} aria-hidden />
      Signed
    </span>
  );
}

interface ExpandableSignedPillProps {
  Icon: LucideIcon;
}

/**
 * Icon-only signed pill that reveals its "Signed" label on hover (pointer) or
 * tap (touch). Full-form pills are static; only the icon variant expands.
 */
function ExpandableSignedPill({ Icon }: ExpandableSignedPillProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      aria-label="Signed"
      aria-expanded={expanded}
      data-expanded={expanded || undefined}
      onClick={(e) => {
        // Keep the pill self-contained inside clickable cards.
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      onMouseLeave={() => setExpanded(false)}
      onBlur={() => setExpanded(false)}
      className="group inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full bg-brand-800 px-0 text-[10px] font-medium leading-tight text-white transition-[padding] hover:px-1.5 data-[expanded]:px-1.5"
    >
      <Icon size={10} aria-hidden className="shrink-0" />
      <span className="hidden whitespace-nowrap group-hover:inline group-data-[expanded]:inline">
        Signed
      </span>
    </button>
  );
}
