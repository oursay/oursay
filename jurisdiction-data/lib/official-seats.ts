/** Official seat profile — a public office seat, not a user account. Unclaimed seats use
 *  {@link seatHandle}; once claimed, the holder's user handle is shown instead. */

export type OfficialSeatKind = "jurisdiction_leader" | "district_mla";

export interface OfficialSeatRecord {
  /** Stable seat handle until claimed, e.g. ab-premier or ab-edm_strth. */
  seatHandle: string;
  seatKind: OfficialSeatKind;
  jurisdictionId: string;
  jurisdictionShortSlug: string;
  /** Public-facing seat title, e.g. "Alberta Premier" or "District MLA". */
  title?: string;
  name: string;
  /** Display role line, e.g. "Premier · Alberta" or "MLA · Edmonton-Strathcona". */
  role: string;
  /** Jurisdiction-leader role key (premier, platform). */
  leaderRole?: string;
  /** Year-less district slug; null for jurisdiction-wide seats without a riding. */
  districtSlug: string | null;
  districtShortSlug: string | null;
  partyName?: string;
  source: "opennorth" | "manual";
  /** When set, the seat is claimed and the user handle is shown publicly. */
  claimedUserHandle?: string | null;
}

export interface OfficialSeatsCatalog {
  version: number;
  jurisdictionId: string;
  jurisdictionShortSlug: string;
  pulledAt: string;
  source: string;
  sourceEndpoint?: string;
  seats: OfficialSeatRecord[];
}

export function seatDisplayHandle(seat: OfficialSeatRecord): string {
  const claimed = seat.claimedUserHandle?.replace(/^@/, "").trim();
  return claimed || seat.seatHandle;
}

export function isSeatClaimed(seat: OfficialSeatRecord): boolean {
  return Boolean(seat.claimedUserHandle?.replace(/^@/, "").trim());
}

export function seatsByHandle(catalog: OfficialSeatsCatalog): Map<string, OfficialSeatRecord> {
  return new Map(catalog.seats.map((seat) => [seat.seatHandle, seat]));
}

export function seatTitleFor(seat: Pick<OfficialSeatRecord, "seatKind" | "leaderRole" | "jurisdictionId">): string {
  if (seat.seatKind === "district_mla") return "District MLA";
  if (seat.leaderRole === "premier") return "Alberta Premier";
  if (seat.leaderRole === "platform") return "Platform · Global";
  return "Jurisdiction Leader";
}

export function seatForDistrict(
  catalog: OfficialSeatsCatalog,
  districtSlug: string,
): OfficialSeatRecord | undefined {
  return catalog.seats.find(
    (seat) => seat.seatKind === "district_mla" && seat.districtSlug === districtSlug,
  );
}
