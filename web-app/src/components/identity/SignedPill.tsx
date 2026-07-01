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
    return (
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white"
        aria-label="Signed"
      >
        <Icon size={10} aria-hidden />
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-800 px-1.5 py-px text-[10px] font-medium leading-tight text-white">
      <Icon size={10} aria-hidden />
      Signed
    </span>
  );
}
