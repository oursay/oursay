// GeocodeService: best-effort, structural geocoding of a participant's address into a private point.
//
// Policy (docs/REGION-MODEL.md, plan C2):
//  - Best-effort: registration NEVER fails because of geocoding. Failures/timeouts/null are warn-logged
//    (NEVER with coordinates) and leave the account intact.
//  - Attempt gate: only geocode a Canadian address with enough signal (postal, or line1+city+province).
//  - CURRENT cache (auth.profile_geocodes) holds the point as of now; it is CLEARED only when the
//    address falls below the gate or leaves Canada. A *failed* re-geocode keeps the last-known-good row.
//  - HISTORY (auth.profile_geocode_history) is append-only: every distinct address->point is recorded
//    and never deleted here. Supports future "ever in region" filters (C7).
//
// This proves an address RESOLVES, not residency/KYC, and stores no district/region id.

import { hasGeocodableAddress, hashAddress, normalizeAddress, type NormalizedAddress } from "../helpers/address.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { GeocodeRepo, GeocodeUpsert } from "../repo/geocode.repo.js";
import type { GeocodeProvider } from "./geocode/provider.js";

/** Outcome of an apply pass — useful to the re-geocode seam's callers and to tests. */
export type GeocodeStatus = "geocoded" | "unresolved" | "cleared" | "unchanged" | "skipped";

export interface GeocodeResult {
  status: GeocodeStatus;
  /** address_hash of the geocoded address, when status === "geocoded". */
  addressHash?: string;
}

/** Structured warn sink. Receives an event + non-PII fields only (never coordinates). */
export type GeocodeWarn = (event: string, fields?: Record<string, unknown>) => void;

const defaultWarn: GeocodeWarn = (event, fields) => {
  console.warn(`[geocode] ${event}`, fields ?? {});
};

export interface GeocodeServiceDeps {
  geocodeRepo: GeocodeRepo;
  provider: GeocodeProvider;
  profileRepo: ProfileRepo;
  warn?: GeocodeWarn;
}

export class GeocodeService {
  private readonly warn: GeocodeWarn;
  constructor(private readonly d: GeocodeServiceDeps) {
    this.warn = d.warn ?? defaultWarn;
  }

  /** Registration path: best-effort, MUST NOT throw into the caller. `addr` is the just-normalized
   *  address from registration (avoids a re-read of the profile we just inserted). */
  async geocodeForUser(userId: string, addr: NormalizedAddress): Promise<void> {
    try {
      await this.apply(userId, addr);
    } catch (e) {
      // Repo failure on the best-effort path must not break registration.
      this.warn("geocode_apply_error", { userId, error: errName(e) });
    }
  }

  /** Re-geocode seam: refresh the cache from the user's CURRENT stored profile address. Called when an
   *  address changes (follow-on PATCH /v1/profile, admin tooling, backfill). Repo errors propagate here
   *  (this is an explicit maintenance call, not the registration hot path). */
  async syncGeocodeForUser(userId: string): Promise<GeocodeResult> {
    const profile = await this.d.profileRepo.getByUserId(userId);
    if (!profile) return { status: "skipped" };
    const addr = normalizeAddress({
      line1: profile.line1,
      line2: profile.line2,
      city: profile.city,
      province: profile.province,
      postalCode: profile.postalCode,
      country: profile.country,
      memo: profile.memo,
    });
    // No-op when the current row already reflects this exact (gate-eligible) address.
    if (addr.country === "CA" && hasGeocodableAddress(addr)) {
      const current = await this.d.geocodeRepo.getCurrent(userId);
      if (current && current.addressHash === hashAddress(addr)) return { status: "unchanged" };
    }
    return this.apply(userId, addr);
  }

  /** Shared best-effort core. Clears current ONLY below gate / non-CA; on a failed geocode it leaves
   *  the current row untouched (keep last-known-good); on success it upserts current AND appends history. */
  private async apply(userId: string, addr: NormalizedAddress): Promise<GeocodeResult> {
    if (addr.country !== "CA" || !hasGeocodableAddress(addr)) {
      await this.d.geocodeRepo.clearCurrent(userId);
      return { status: "cleared" };
    }

    let hit;
    try {
      hit = await this.d.provider.geocode(addr);
    } catch (e) {
      // Provider should be non-throwing for "no result", but never let it bubble.
      this.warn("geocode_provider_error", { userId, provider: this.d.provider.name, error: errName(e) });
      return { status: "unresolved" };
    }
    if (!hit) {
      this.warn("geocode_unresolved", { userId, provider: this.d.provider.name });
      return { status: "unresolved" };
    }

    const addressHash = hashAddress(addr);
    const row: GeocodeUpsert = {
      userId,
      addressHash,
      lon: hit.lon,
      lat: hit.lat,
      provider: this.d.provider.name,
      confidence: hit.confidence,
    };
    await this.d.geocodeRepo.upsertCurrent(row);
    await this.d.geocodeRepo.appendHistory(row);
    return { status: "geocoded", addressHash };
  }
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}
