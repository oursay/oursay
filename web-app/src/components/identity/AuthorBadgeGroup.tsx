/**
 * Convenience shim over {@link EntityMarkGroup}. Prefer EntityMarkGroup for
 * new call sites.
 *
 * TODO(entity-header): later rename AuthorRow → EntityHeader owning chrome +
 * this group.
 */
import type { PillDisplayMode, PlatformRole, SignTier, VerificationTier } from "@/lib/types";
import type { AuthorGeoRelation } from "@/lib/types";
import {
  authorBadgeModes,
  EntityMarkGroup,
  type BadgeSurface,
} from "./EntityMarkGroup";

export type { BadgeSurface };
export { authorBadgeModes };

interface AuthorBadgeGroupProps {
  signTier?: SignTier;
  /**
   * Official role flag (not a KYC tier). May later widen to seat lists per
   * jurisdiction.
   */
  official?: boolean;
  /** KYC tier 0–2 only. */
  tier: VerificationTier;
  platformRole?: PlatformRole | null;
  authorGeo?: AuthorGeoRelation;
  signedMode: PillDisplayMode;
  kycMode: PillDisplayMode;
  align?: "left" | "right";
}

export function AuthorBadgeGroup({
  signTier,
  official,
  tier,
  platformRole,
  authorGeo,
  signedMode,
  kycMode,
  align = "left",
}: AuthorBadgeGroupProps) {
  return (
    <EntityMarkGroup
      signTier={signTier}
      official={official}
      tier={tier}
      platformRole={platformRole}
      authorGeo={authorGeo}
      signedMode={signedMode}
      kycMode={kycMode}
      align={align}
    />
  );
}
