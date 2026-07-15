import type { JurisdictionMembership } from "@/lib/types";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";
import { apiGet, isMockOnly } from "./client";
import { readSubscriptions } from "@/lib/state/cookies";

/**
 * The viewer's subscribed jurisdictions (cookie-shaped, works logged-out).
 * Live mode merges server memberships with cookie include flags when logged in.
 */
export async function getJurisdictionMembership(): Promise<
  JurisdictionMembership[]
> {
  if (isMockOnly()) {
    return [
      { id: GLOBAL_ID, included: false },
      { id: ALBERTA_ID, included: true },
    ];
  }

  const cookieSubs = readSubscriptions();
  const server = await apiGet<{ jurisdictionIds: string[] }>(
    "/v1/me/jurisdictions",
  ).catch(() => null);

  if (!server?.jurisdictionIds?.length) {
    return cookieSubs;
  }

  const includedById = new Map(cookieSubs.map((s) => [s.id, s.included]));
  return server.jurisdictionIds.map((id) => ({
    id,
    // Cookie wins; otherwise default Alberta into the feed (not Global).
    included: includedById.get(id) ?? id === ALBERTA_ID,
  }));
}
