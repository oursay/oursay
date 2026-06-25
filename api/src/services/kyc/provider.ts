// Pluggable KYC provider: "authenticated user -> awarded verification tier" (or null when the provider
// declines / cannot verify). Mirrors the geocode provider seam (services/geocode/provider.ts): the
// platform's business logic calls KycService, never a vendor SDK directly (docs/01 §5.1). A provider
// must NEVER throw for an ordinary "no result / declined" outcome — it returns null so the caller can
// treat verification as non-fatal. No PII (name, address, document data) belongs on the public record:
// a provider returns only the awarded TIER (+ an optional coarse region tag), never the underlying
// evidence.

import type { KycTier } from "../../types/kyc.js";

/** The verification outcome a provider awards: a tier, plus an optional coarse region tag stored on the
 *  attestation row (NOT a precise point — that is private geocode state, a separate concern). */
export interface KycAttestation {
  tier: KycTier;
  region?: string | null;
}

/** What the platform hands a provider to verify. The stub uses `requestedTier` directly; a real provider
 *  (equifax) would ignore it and derive the tier from its own verification result. */
export interface KycVerifyRequest {
  userId: string;
  requestedTier: KycTier;
  region?: string | null;
}

export interface KycProvider {
  /** Stable provider name persisted on the attestation row (e.g. "stub", "equifax"). */
  readonly name: string;
  /** Verify a user and award a tier, or null when the provider declines. Non-throwing for "no result". */
  verify(req: KycVerifyRequest): Promise<KycAttestation | null>;
}
