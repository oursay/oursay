// GeocodeService: best-effort, structural resolution of a participant location into a private point.
//
// Policy (docs/REGION-MODEL.md, profile-geocode.md):
//  - Best-effort: registration NEVER fails because of geocoding. Failures/timeouts/null are warn-logged
//    (NEVER with coordinates) and leave the account intact.
//  - Attempt gate: only geocode when hasGeocodableAddress (postal, or line1+city+province).
//    Country filtering is NOT applied here — Canada-only stays on StubGeocodeProvider.
//  - location_hash (DB column address_hash): when a point exists, hash of 3-dp rounded lon/lat;
//    when unresolved, hashAddress of the normalized address (idempotency for retries).
//  - CURRENT cache (auth.profile_geocodes) holds the rounded point as of now; it is CLEARED only when
//    the address falls below the gate. A *failed* re-geocode keeps the last-known-good row.
//  - HISTORY (auth.profile_geocode_history) is append-only: every distinct location_hash→point is
//    recorded and never deleted here. Supports future "ever in region" filters (C7).
//
// This proves a location RESOLVES, not residency/KYC, and stores no district/region id.

import {
  hasGeocodableAddress,
  hashAddress,
  hashRoundedPoint,
  normalizeAddress,
  roundCoord,
  type NormalizedAddress,
} from "../helpers/address.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { GeocodeRepo, GeocodeUpsert } from "../repo/geocode.repo.js";
import type { GeocodeProvider } from "./geocode/provider.js";
import type { EphemeralPoaLocation } from "./kyc/session-provider.js";

/** Outcome of an apply pass — useful to the re-geocode seam's callers and to tests. */
export type GeocodeStatus = "geocoded" | "unresolved" | "cleared" | "unchanged" | "skipped";

export interface GeocodeResult {
  status: GeocodeStatus;
  /** location_hash (DB address_hash) when status === "geocoded" or meaningful for unchanged. */
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
    return this.apply(userId, addr);
  }

  /**
   * POA / residency path: ephemeral Didit intake → private point. Best-effort; callers should catch.
   * Prefer Didit coords (provider "didit"); else geocode seam (stub/geocodio). Never writes profile street.
   * Does not clear an existing point when intake is missing or below the address gate.
   */
  async applyResidencyLocation(userId: string, intake: EphemeralPoaLocation | null): Promise<GeocodeResult> {
    if (!intake) return { status: "skipped" };
    if (intake.kind === "coords") {
      return this.upsertRoundedPoint(userId, intake.lon, intake.lat, "didit", null);
    }
    if (!hasGeocodableAddress(intake.addr)) return { status: "skipped" };
    return this.applyAddressKeepOnMiss(userId, intake.addr);
  }

  /** Like apply, but never clears: used for POA so a weak address cannot wipe a prior point. */
  private async applyAddressKeepOnMiss(userId: string, addr: NormalizedAddress): Promise<GeocodeResult> {
    let hit;
    try {
      hit = await this.d.provider.geocode(addr);
    } catch (e) {
      this.warn("geocode_provider_error", { userId, provider: this.d.provider.name, error: errName(e) });
      return { status: "unresolved" };
    }
    if (!hit) {
      this.warn("geocode_unresolved", { userId, provider: this.d.provider.name });
      const addrHash = hashAddress(addr);
      const current = await this.d.geocodeRepo.getCurrent(userId);
      if (current && current.addressHash === addrHash) return { status: "unchanged", addressHash: addrHash };
      return { status: "unresolved" };
    }
    return this.upsertRoundedPoint(userId, hit.lon, hit.lat, this.d.provider.name, hit.confidence);
  }

  /** Shared best-effort core for a normalized address. Clears current ONLY below the geocode gate;
   *  on a failed geocode it leaves the current row untouched (keep last-known-good); on success it
   *  upserts rounded geom + location_hash AND appends history when the hash changed. */
  private async apply(userId: string, addr: NormalizedAddress): Promise<GeocodeResult> {
    if (!hasGeocodableAddress(addr)) {
      await this.d.geocodeRepo.clearCurrent(userId);
      return { status: "cleared" };
    }

    // Unresolved-address idempotency: same address hash as current location_hash and no need to
    // re-call the provider when we never got a point from that exact address-key… we can't store
    // hash-without-geom in current. After a point exists, location_hash is coord-based, so we always
    // attempt the provider here; upsertRoundedPoint then returns unchanged when the rounded point matches.

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
      // Address-hash idempotency for "same unresolved address again": if current somehow keyed by
      // hashAddress (legacy) match, treat as unchanged; otherwise keep last-known-good.
      const addrHash = hashAddress(addr);
      const current = await this.d.geocodeRepo.getCurrent(userId);
      if (current && current.addressHash === addrHash) return { status: "unchanged", addressHash: addrHash };
      return { status: "unresolved" };
    }

    return this.upsertRoundedPoint(userId, hit.lon, hit.lat, this.d.provider.name, hit.confidence);
  }

  /** Shared resolved-point path: round to 3 dp → location_hash → unchanged or upsert. */
  private async upsertRoundedPoint(
    userId: string,
    lon: number,
    lat: number,
    provider: string,
    confidence: number | null,
  ): Promise<GeocodeResult> {
    const rLon = roundCoord(lon);
    const rLat = roundCoord(lat);
    const locationHash = hashRoundedPoint(rLon, rLat);

    const current = await this.d.geocodeRepo.getCurrent(userId);
    if (current && current.addressHash === locationHash) {
      return { status: "unchanged", addressHash: locationHash };
    }

    const row: GeocodeUpsert = {
      userId,
      addressHash: locationHash,
      lon: rLon,
      lat: rLat,
      provider,
      confidence,
    };
    await this.d.geocodeRepo.upsertCurrent(row);
    await this.d.geocodeRepo.appendHistory(row);
    return { status: "geocoded", addressHash: locationHash };
  }
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}
