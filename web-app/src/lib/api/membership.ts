import type { JurisdictionMembership } from "@/lib/types";

/**
 * The viewer's subscribed jurisdictions (cookie-shaped, works logged-out).
 * Mirrors the wireframe's `state.subs` — Global is the default; Alberta is added
 * here so the sample corpus is visible in the unified feed.
 *
 * There is no server route today; persistence is a client cookie. See CONTRACT.md.
 */
export async function getJurisdictionMembership(): Promise<
  JurisdictionMembership[]
> {
  return [
    { name: "Global", included: true },
    { name: "Alberta", included: true },
  ];
}
