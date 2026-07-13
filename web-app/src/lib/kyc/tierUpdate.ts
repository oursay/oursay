import type { VerificationTier } from "@/lib/types";
import type { VerifyChoice } from "@/components/chrome/VerifyModal";

/** Label for the Account Settings tier-matched update row; null when unverified. */
export function tierMatchedUpdateLabel(tier: VerificationTier): "ID Update" | "Residency Update" | null {
  if (tier <= 0) return null;
  if (tier === 1) return "ID Update";
  return "Residency Update";
}

/**
 * Workflow forced by the tier-matched shortcut — same as Get Verified → current-tier option.
 * Unverified has no match (use the chooser).
 */
export function tierMatchedVerifyChoice(tier: VerificationTier): VerifyChoice | null {
  if (tier <= 0) return null;
  if (tier === 1) return "identity";
  return "poa";
}
