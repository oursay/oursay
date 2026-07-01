/** A jurisdiction's leader (name only; the seat/role is inferred from the jurisdiction). */
export interface JurisdictionLeader {
  name: string;
  /** Mock profile handle for the jurisdiction leader. */
  handle: string;
}

/** A district (riding) within a jurisdiction, as listed on the Jurisdiction view. */
export interface DistrictSummary {
  name: string;
  /** Year-less riding slug — matches district page routes. */
  slug: string;
  /** Riding leader display name (e.g. the MLA). */
  leader: string;
  /** Mock profile handle for the riding leader. */
  leaderHandle: string;
}

/**
 * Jurisdiction summary for the Jurisdiction view (the wireframe's JUR_DATA).
 * Global has neither a district map nor ridings (districtLabel null, districts []).
 */
export interface JurisdictionSummary {
  name: string;
  leader: JurisdictionLeader;
  rules: string[];
  /** Label for the district collection, e.g. "Ridings"; null when none. */
  districtLabel: string | null;
  districts: DistrictSummary[];
}

/**
 * District detail for the District view (the wireframe's DISTRICT). The
 * representative riding; production loads by slug.
 */
export interface DistrictDetail {
  name: string;
  slug: string;
  /** Parent jurisdiction name. */
  jur: string;
  leader: string;
  /** Mock profile handle for the riding leader (MLA). */
  leaderHandle: string;
  boundaryYear: number;
  source: string;
  about: string[];
}
