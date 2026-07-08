/** One official role line on a profile, e.g. "Premier · Alberta". */
export interface ProfileRoleTag {
  roleLabel: string;
  placeLabel: string;
  jurisdictionId: string;
  districtSlug: string | null;
  seatHandle: string | null;
  /** Whether the place segment links to a jurisdiction or district page. */
  placeKind: "jurisdiction" | "district";
}
