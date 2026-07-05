// ViewerContextService ([align-w4-api-surface]): resolve the (optional) authenticated viewer into
// the context every viewer-dependent read resolution consumes — the server-side twin of the
// web-app's ViewerContext (web-app/src/lib/types/viewer.ts). Resolution is PRIVATE: the viewer's
// point, home districts, and role feed identity-reveal / authorGeo decisions but the raw values
// never appear on a response for anyone but the viewer themself (/v1/me/districts is self-only).
//
// Officials: in-district logic is FORCED to the represented district, never the home address
// (WEB-APP-GAPS Part 6 #5) — a represented seat replaces (not augments) the geocoded home seat for
// that jurisdiction.

import type { GeoStore } from "@oursay/geo";
import type { JurisdictionConfig } from "@oursay/public-record";
import type { KycRepo } from "../repo/kyc.repo.js";
import type { MembershipRepo } from "../repo/membership.repo.js";
import type { ProfileRepo } from "../repo/profile.repo.js";
import type { UserRepo } from "../repo/user.repo.js";
import { normalizeTier, type KycTier } from "../types/kyc.js";
import { normalizeVisibility, type AuthorVisibility } from "../types/visibility.js";
import type { ParticipantGeoService } from "./participant-geo.service.js";

/** Numeric UI rank of a KYC tier (the web-app's VerificationTier 0-2 projection; officials are a
 *  ROLE, not a rank). electoral_validated ranks with residency — it implies a residency check. */
export function kycRank(tier: KycTier): 0 | 1 | 2 {
  if (tier === "identity_verified") return 1;
  if (tier === "residency_verified" || tier === "electoral_validated") return 2;
  return 0;
}

/** The resolved viewer. `homeDistricts` are stable seat SLUGS across every registered jurisdiction
 *  (empty unless the viewer resolves a point — mirroring "empty unless residency-verified" demo
 *  semantics via the kycRank gates at the use sites). */
export interface ApiViewer {
  userId: string | null;
  loggedIn: boolean;
  tier: KycTier;
  kycRank: 0 | 1 | 2;
  /** Home seat slugs (officials: the represented seat for that jurisdiction instead). */
  homeDistricts: string[];
  /** Jurisdiction ids where the viewer holds the official role. */
  officialIn: Set<string>;
  /** The viewer's own account-default visibility (drives the seenByOthersAs self hint). */
  visibility: AuthorVisibility;
  handle: string | null;
  displayName: string | null;
}

export const ANONYMOUS_VIEWER: ApiViewer = {
  userId: null,
  loggedIn: false,
  tier: "unverified",
  kycRank: 0,
  homeDistricts: [],
  officialIn: new Set(),
  visibility: "anonymous",
  handle: null,
  displayName: null,
};

export interface ViewerContextServiceDeps {
  userRepo: UserRepo;
  profileRepo: ProfileRepo;
  kycRepo: KycRepo;
  membershipRepo: MembershipRepo;
  participantGeoService: ParticipantGeoService;
  geoStore: GeoStore;
  /** Every registered jurisdiction (home seats resolve against each one's boundary set). */
  jurisdictions: JurisdictionConfig[];
}

export class ViewerContextService {
  constructor(private readonly d: ViewerContextServiceDeps) {}

  /** Resolve a session's userId (or null) into the viewer context. Unknown/deleted users read as
   *  anonymous rather than erroring — a public read must never 500 over a stale session row. */
  async resolve(userId: string | null | undefined): Promise<ApiViewer> {
    if (!userId) return ANONYMOUS_VIEWER;
    const [user, profile, tierRaw, memberships] = await Promise.all([
      this.d.userRepo.getById(userId),
      this.d.profileRepo.getByUserId(userId),
      this.d.kycRepo.latestTier(userId),
      this.d.membershipRepo.listForUser(userId),
    ]);
    if (!user) return ANONYMOUS_VIEWER;

    const tier = normalizeTier(tierRaw);
    const officialIn = new Set(memberships.filter((m) => m.role === "official").map((m) => m.jurisdictionId));
    const represented = new Map(
      memberships
        .filter((m) => m.role === "official" && m.representedDistrictSlug)
        .map((m) => [m.jurisdictionId, m.representedDistrictSlug as string]),
    );
    return {
      userId,
      loggedIn: true,
      tier,
      kycRank: kycRank(tier),
      homeDistricts: await this.homeDistrictSlugs(userId, represented),
      officialIn,
      visibility: normalizeVisibility(profile?.visibility),
      handle: user.handle,
      displayName: user.displayName,
    };
  }

  /** Home seat slugs for a user across every registered jurisdiction: the represented seat where
   *  the user is an official there (Part 6 #5), else the seat containing their CURRENT geocoded
   *  point. No point / outside every seat ⇒ that jurisdiction contributes nothing. */
  async homeDistrictSlugs(userId: string, represented?: Map<string, string>): Promise<string[]> {
    const point = await this.d.participantGeoService.currentPoint(userId);
    const out = new Set<string>();
    const asOf = new Date();
    for (const j of this.d.jurisdictions) {
      const rep = represented?.get(j.id);
      if (rep) {
        out.add(rep);
        continue;
      }
      if (!point) continue;
      const slug = await this.d.geoStore.districtSlugContaining(j.id, point, asOf);
      if (slug) out.add(slug);
    }
    return [...out];
  }
}
