/**
 * Author profile-visibility setting — who may see the identity (name/handle/
 * profile link) behind an author's otherwise-anonymized civic records.
 *
 * Demo projection of docs/09-ACCOUNT-PRIVACY-MODEL.md: visibility governs the
 * account→identity surface only. The signed civic data (record body, counts,
 * verification tier, districts) stays public regardless; when the viewer is
 * out of scope the author renders as a per-thread persona (thread-persona.md).
 */
export type AuthorVisibility =
  | "anonymous"
  | "my_officials"
  | "all_officials"
  | "my_district"
  | "my_jurisdiction"
  | "id_verified"
  | "public";

/** Selectable values, most private first (picker display order). */
export const VISIBILITY_VALUES: AuthorVisibility[] = [
  "anonymous",
  "all_officials",
  "my_district",
  "public",
];

export const VISIBILITY_LABEL: Record<AuthorVisibility, string> = {
  public: "Public",
  id_verified: "ID Verified",
  my_jurisdiction: "My Jurisdiction",
  my_district: "My District",
  all_officials: "Officials",
  my_officials: "My Officials",
  anonymous: "Anonymous",
};

/** One-line picker descriptions (who gets to see your profile). */
export const VISIBILITY_DESCRIPTION: Record<AuthorVisibility, string> = {
  public: "Everyone can see your profile",
  id_verified: "Only identity-verified members",
  my_jurisdiction: "Residency-verified members of your jurisdiction",
  my_district: "Residency-verified members of your district",
  all_officials: "Verified officials can see your profile",
  my_officials: "Only your district's officials",
  anonymous: "No one — always a per-thread persona",
};
