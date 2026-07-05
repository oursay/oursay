// KycService: the single business-logic entry point for KYC verification (docs/01 §5.1). The platform
// calls THIS, never a vendor SDK; the pluggable KycProvider (stub by default; equifax reserved) does
// the verification, and the awarded tier is appended to public.kyc_attestations via
// PrivateStore.putAttestation — the SAME append-only table recovery (KycRepo) and the public count
// filter read newest-first (ORDER BY attested_at DESC LIMIT 1), so attestation has one source of truth.
//
// No PII is logged or stored on the row: only the awarded tier (+ an optional coarse region tag). MVP is
// platform-trust (R26) — rows the platform wrote; provider signatures on rows (R27) are deferred.

import type { PrivateStore } from "@oursay/public-record";
import type { KycRepo } from "../repo/kyc.repo.js";
import { normalizeTier, type KycTier } from "../types/kyc.js";
import type { KycProvider } from "./kyc/provider.js";

export interface KycServiceDeps {
  provider: KycProvider;
  recordStore: PrivateStore;
  kycRepo: KycRepo;
}

export class KycService {
  constructor(private readonly d: KycServiceDeps) {}

  /** Verify a user via the configured provider and, on success, append the awarded tier to
   *  kyc_attestations. Returns the awarded tier; returns null (no row written) when the provider
   *  declines. `requestedTier` is the tier the dev stub awards directly; a real provider derives its
   *  own from the verification result. */
  async attest(
    userId: string,
    requestedTier: KycTier = "residency_verified",
    region: string | null = null,
  ): Promise<{ tier: KycTier } | null> {
    const result = await this.d.provider.verify({ userId, requestedTier, region });
    if (!result) return null;
    await this.d.recordStore.putAttestation({
      userId,
      provider: this.d.provider.name,
      tier: result.tier,
      region: result.region ?? null,
    });
    return { tier: result.tier };
  }

  /** The user's CURRENT verification tier (latest attestation, or `unverified` when none). Shares the
   *  KycRepo read seam with the recovery policy and the count filter. */
  async currentTier(userId: string): Promise<KycTier> {
    return normalizeTier(await this.d.kycRepo.latestTier(userId));
  }
}
