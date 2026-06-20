// Read-only access to public.kyc_attestations (owned by @oursay/public-record). Recovery uses this
// to decide whether a verified user must re-verify via KYC instead of recovering via email alone.

import type pg from "pg";

/** Tiers that count as "verified" for the recovery policy branch (docs/01 §4.3–4.4). */
const VERIFIED_TIERS = new Set(["identity_verified", "residency_verified"]);

export class KycRepo {
  constructor(private readonly pool: pg.Pool) {}

  /** Latest attestation tier for a user, or null if none (no row = unverified). */
  async latestTier(userId: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT tier FROM public.kyc_attestations WHERE user_id = $1 ORDER BY attested_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0]?.tier ?? null;
  }

  async isVerified(userId: string): Promise<boolean> {
    const tier = await this.latestTier(userId);
    return tier != null && VERIFIED_TIERS.has(tier);
  }
}
