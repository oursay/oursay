// Author-visibility values (WEB-APP-GAPS C4; docs/09-ACCOUNT-PRIVACY-MODEL.md). The FULL web-app
// enum — the picker ships 4 of these today (anonymous | all_officials | my_district | public), the
// rest are audience rungs the schema accepts so the UI can grow into them without a migration.
// Kept in a tiny, dependency-free module (mirrors ./kyc.ts) so the schema DDL, repos, the identity
// read resolution, and the /v1/me routes share ONE definition.
//
// Visibility governs the author's IDENTITY surface only (name/handle/profile link/avatar seed);
// civic data (tallies, tier pill, sign pill) stays public — anonymized civic signals, not identity.
// Effective value cascades `thread ?? account ?? anonymous`, and a per-thread override wins
// OUTRIGHT in either direction (it may widen or narrow — C4).

export type AuthorVisibility =
  | "anonymous"
  | "my_officials"
  | "all_officials"
  | "my_district"
  | "my_jurisdiction"
  | "id_verified"
  | "public";

export const AUTHOR_VISIBILITIES: AuthorVisibility[] = [
  "anonymous",
  "my_officials",
  "all_officials",
  "my_district",
  "my_jurisdiction",
  "id_verified",
  "public",
];

/** Coerce a stored visibility to the canonical enum. The legacy 4-value schema spelled
 *  `all_officials` as `officials` (pre-C4) — map it forward; anything unrecognized (or absent)
 *  falls to the privacy floor, `anonymous`. */
export function normalizeVisibility(raw: string | null | undefined): AuthorVisibility {
  if (raw === "officials") return "all_officials";
  return raw != null && (AUTHOR_VISIBILITIES as string[]).includes(raw)
    ? (raw as AuthorVisibility)
    : "anonymous";
}
