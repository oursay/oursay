import type { PillDisplayMode, PlatformRole, SignTier, VerificationTier } from "@/lib/types";
import { showsSignedPill } from "@/lib/types/sign-tier";
import { SignedPill } from "./SignedPill";
import { PlatformMark } from "./PlatformMark";
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
  /**
   * Platform role mark (`admin`). TODO(marks[]): iterate AuthorMark[] instead of
   * discrete props — see .agents/plans/V1-ROADMAP.md.
   */
  platformRole?: PlatformRole | null;
  /** Residency author's spatial relation to the context. */
  authorGeo?: AuthorGeoRelation;
  signedMode: PillDisplayMode;
  kycMode: PillDisplayMode;
  align?: "left" | "right";
}

/**
 * [Signed] [Platform] [KYC] badge group (§2.4). Order fixed:
 * Signed → Platform → (Media reserved V1-B) → KYC.
 *
 * Naming: recommend consolidating *Pill → Mark in a follow-up
 * (.agents/plans/V1-ROADMAP.md); do not rename in V1-A.
 */
export function AuthorBadgeGroup({
  signTier,
  tier,
  platformRole,
  authorGeo,
  signedMode,
  kycMode,
  align = "left",
}: AuthorBadgeGroupProps) {
  const showSigned = showsSignedPill(signTier);
  const showPlatform = platformRole === "admin";
  const showKyc = tier > 0;
  if (!showSigned && !showPlatform && !showKyc) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${align === "right" ? "ml-auto" : ""}`}
    >
      <SignedPill signTier={signTier} mode={signedMode} />
      {showPlatform ? <PlatformMark mode={kycMode} /> : null}
      <VerificationPill tier={tier} authorGeo={authorGeo} mode={kycMode} />
    </span>
  );
}
