// TODO(slug-promotion): districtShortSlug is a real slug utility, not mock data — it currently
// lives under lib/mock/ for historical reasons. Promote it (and the other genuine helpers in
// lib/mock/) out of mock/ into lib proper, and ultimately into a shared zero-dep @oursay/slugs
// package consumed by web-app + geo + jurisdiction-data. See plan R8 follow-up.
import { districtShortSlug } from "@/lib/mock/slug";
import type { OfficialLeaderRole } from "@/lib/types/jurisdiction";

const JURISDICTION_SHORT: Record<string, string> = {
  "ab-ca-gov": "ab",
  "oursay-global": "global",
};

/** Derive the district MLA seat handle when the API omits it (matches jurisdiction-data slugs). */
export function districtSeatHandle(jurisdictionId: string, districtSlug: string): string {
  const jurShort = JURISDICTION_SHORT[jurisdictionId] ?? jurisdictionId.split("-")[0] ?? "x";
  return `${jurShort}-${districtShortSlug(districtSlug)}`;
}

/** Demo + seeded official seats mapped to the holder's user handle (avatar seed).
 * Demo accounts are fictional only — real roster names stay on UNCLAIMED seats. */
const CLAIMED_SEAT_USERS: Record<string, string> = {
  "global-platform": "oursay",
  "ab-premier": "premier",
};

export function isSeatClaimed(seatHandle: string): boolean {
  return seatHandle.replace(/^@/, "").toLowerCase() in CLAIMED_SEAT_USERS;
}

/** User handle for a claimed seat — stable avatar seed across duplicate office rows. */
export function claimedUserHandleForSeat(seatHandle: string | undefined | null): string | null {
  if (!seatHandle) return null;
  return CLAIMED_SEAT_USERS[seatHandle.replace(/^@/, "").toLowerCase()] ?? null;
}

export function inferLeaderRole(opts: {
  jurisdictionId?: string;
  districtSlug?: string | null;
  leaderRole?: string | null;
  seatKind?: string | null;
  role?: string | null;
  seatHandle?: string | null;
}): OfficialLeaderRole {
  const roleKey = opts.leaderRole?.toLowerCase();
  if (roleKey === "premier" || roleKey === "platform" || roleKey === "mla") return roleKey;

  const roleLine = opts.role?.toLowerCase() ?? "";
  if (roleLine.startsWith("premier")) return "premier";
  if (roleLine.startsWith("platform")) return "platform";
  if (roleLine.startsWith("mla")) return "mla";

  const handle = opts.seatHandle?.replace(/^@/, "").toLowerCase();
  if (handle === "global-platform") return "platform";
  if (handle?.endsWith("-premier")) return "premier";

  if (opts.seatKind === "jurisdiction_leader") {
    return opts.jurisdictionId === "oursay-global" ? "platform" : "premier";
  }

  if (opts.districtSlug) return "mla";
  if (opts.jurisdictionId === "oursay-global") return "platform";
  return "premier";
}
