import type { PillDisplayMode, SignTier, VerificationTier } from "@/lib/types";
import { showsSignedPill } from "@/lib/types/sign-tier";
import { SignedPill } from "./SignedPill";
import { VerificationPill } from "./VerificationPill";
import type { AuthorGeoRelation } from "./VerificationPill";

export type BadgeSurface = "post" | "comment";

/** Depth-aware pill modes per DESIGN-DECISIONS §2 / product table. */
export function authorBadgeModes(
  surface: BadgeSurface,
  depth = 1,
): { signedMode: PillDisplayMode; kycMode: PillDisplayMode } {
  if (surface === "post") {
    return { signedMode: "icon", kycMode: "full" };
  }
  if (depth === 1) {
    return { signedMode: "full", kycMode: "icon" };
  }
  return { signedMode: "icon", kycMode: "icon" };
}

interface AuthorBadgeGroupProps {
  signTier?: SignTier;
  tier: VerificationTier;
  /** Residency author's spatial relation to the context. */
  authorGeo?: AuthorGeoRelation;
  signedMode: PillDisplayMode;
  kycMode: PillDisplayMode;
  align?: "left" | "right";
}

/** [Signed] [KYC] badge group, right-justified (§2.4). Order fixed: Signed left of KYC. */
export function AuthorBadgeGroup({
  signTier,
  tier,
  authorGeo,
  signedMode,
  kycMode,
  align = "left",
}: AuthorBadgeGroupProps) {
  const showSigned = showsSignedPill(signTier);
  const showKyc = tier > 0;
  if (!showSigned && !showKyc) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${align === "right" ? "ml-auto" : ""}`}
    >
      <SignedPill signTier={signTier} mode={signedMode} />
      <VerificationPill tier={tier} authorGeo={authorGeo} mode={kycMode} />
    </span>
  );
}
