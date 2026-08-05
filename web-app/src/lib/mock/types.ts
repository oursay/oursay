/** One Alberta provincial riding with its mock MLA persona. */
export interface AlbertaRiding {
  name: string;
  slug: string;
  mla: {
    name: string;
    /** Official seat handle (unclaimed). */
    seatHandle: string;
    /** Demo user handle for authored corpus content. */
    handle: string;
  };
}

import type { AuthorVisibility } from "@/lib/types/visibility";
import type { VerificationTier } from "@/lib/types/verification";

/** A mock persona referenced by posts, comments, and profiles. */
export interface MockPerson {
  name: string;
  handle: string;
  /** KYC tier: 0 None · 1 Identity · 2 Residency. */
  tier: VerificationTier;
  /**
   * Official role flag (not a KYC tier). May later widen to seat lists per
   * jurisdiction.
   */
  official?: boolean;
  /** Home riding slug(s); absent for jurisdiction-wide officials. */
  districts?: string[];
  /** Profile role line, e.g. "MLA · Edmonton-Strathcona". */
  role?: string;
  /**
   * Account-default profile visibility. Absent means `public` in the mock
   * corpus (the doc-faithful `anonymous` floor lives in resolveVisibility);
   * out-of-scope viewers see a per-thread persona instead of this identity.
   */
  visibility?: AuthorVisibility;
}
