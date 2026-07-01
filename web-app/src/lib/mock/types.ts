/** One Alberta provincial riding with its mock MLA persona. */
export interface AlbertaRiding {
  name: string;
  slug: string;
  mla: {
    name: string;
    handle: string;
  };
}

/** A mock persona referenced by posts, comments, and profiles. */
export interface MockPerson {
  name: string;
  handle: string;
  /** 0 None · 1 Identity · 2 Residency · 3 Official */
  tier: 0 | 1 | 2 | 3;
  /** Home riding slug(s); absent for jurisdiction-wide officials. */
  districts?: string[];
  /** Profile role line, e.g. "MLA · Edmonton-Strathcona". */
  role?: string;
}
