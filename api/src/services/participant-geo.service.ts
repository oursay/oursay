// ParticipantGeoService: the PRIVATE, service-layer bridge from a civic-record participant to the
// geography inputs a later phase (mvp-c7-filter-resolution) needs to apply geo filters to counts.
//
// Three resolution steps, all private (never on an unauthenticated HTTP response or OpenAPI schema):
//   1. participant -> userId   — authorPubkey (persona Pₜ) via the thread-key binding the civic engine
//      itself uses (PrivateStore.getThreadKey); or a singleton's nullifier+parentId via the platform
//      attestation (PrivateStore.getUserByNullifier).
//   2. userId -> current point — the cached private point (GeocodeRepo.getCurrent / auth.profile_geocodes).
//   3. point -> district revision — reverse point-in-polygon over the effective-dated boundary set
//      (GeoStore.districtContaining), i.e. the `current`-mode resolver of docs/REGION-MODEL.md.
//
// Outcomes are non-throwing: an unlinkable participant or one with no geocode row yields
// `hasPoint: false` (per REGION-MODEL, no usable point ⇒ out-of-area for scoped filters in C7) — not
// an error. This service supplies points + a viewer-district hint; it does NOT activate any filter,
// reimplement Region.contains, or store a district on the user row.

import { GeoStore, type LngLat } from "@oursay/geo";
import type { PrivateStore } from "@oursay/public-record";
import type { GeocodeRepo } from "../repo/geocode.repo.js";

/** A civic-record participant key. `authorPubkey` (persona Pₜ) is the primary link and is present on
 *  every record_tx row; `nullifier` (+ its `parentId`) is the singleton fallback. */
export interface ParticipantRef {
  authorPubkey?: string;
  nullifier?: string;
  parentId?: string;
}

/** The resolved private geography for a participant. `point` is PRIVATE — internal/test use only,
 *  never serialized to an HTTP response. */
export interface ParticipantGeo {
  userId: string | null;
  hasPoint: boolean;
  /** The district revision id containing the participant's current point at `asOf` (the value the
   *  authenticated `my-district` scope consumes), or null when there is no point / no containing riding. */
  districtId: string | null;
  point?: { lon: number; lat: number };
}

export interface ParticipantGeoServiceDeps {
  recordStore: PrivateStore;
  geocodeRepo: GeocodeRepo;
  geoStore: GeoStore;
}

export class ParticipantGeoService {
  constructor(private readonly d: ParticipantGeoServiceDeps) {}

  /** Resolve a participant to its verified `userId`, or null when the platform cannot link them.
   *  Primary: the persona Pₜ (authorPubkey) via the thread-key binding. Fallback: a singleton's
   *  nullifier, which requires its `parentId` (the UNIQUE(parent_id, nullifier) key). */
  async resolveUserId(ref: ParticipantRef): Promise<string | null> {
    if (ref.authorPubkey) {
      const tk = await this.d.recordStore.getThreadKey(ref.authorPubkey);
      if (tk) return tk.userId;
    }
    if (ref.nullifier && ref.parentId) {
      return this.d.recordStore.getUserByNullifier(ref.parentId, ref.nullifier);
    }
    return null;
  }

  /** The user's CURRENT private point, or null when no geocode row exists. */
  async currentPoint(userId: string): Promise<LngLat | null> {
    const current = await this.d.geocodeRepo.getCurrent(userId);
    return current ? { lon: current.lon, lat: current.lat } : null;
  }

  /** The district revision id containing the user's current point at `asOf` (one revision per riding),
   *  or null when the user has no point or the point falls outside every riding. This is the
   *  `viewerDistrictId` an authenticated `RegionResolver.compileScope({ scope: "my-district", … })`
   *  consumes. */
  async viewerDistrictId(userId: string, jurisdictionId: string, asOf: Date = new Date()): Promise<string | null> {
    const point = await this.currentPoint(userId);
    if (!point) return null;
    return this.d.geoStore.districtContaining(jurisdictionId, point, asOf);
  }

  /** Resolve a participant end to end: link to a user, load their current point, and reverse-resolve
   *  the containing district at `asOf`. Never throws on a missing link/point — returns `hasPoint:false`. */
  async resolveParticipant(
    ref: ParticipantRef,
    jurisdictionId: string,
    asOf: Date = new Date(),
  ): Promise<ParticipantGeo> {
    const userId = await this.resolveUserId(ref);
    if (!userId) return { userId: null, hasPoint: false, districtId: null };

    const point = await this.currentPoint(userId);
    if (!point) return { userId, hasPoint: false, districtId: null };

    const districtId = await this.d.geoStore.districtContaining(jurisdictionId, point, asOf);
    return { userId, hasPoint: true, districtId, point: { lon: point.lon, lat: point.lat } };
  }
}
