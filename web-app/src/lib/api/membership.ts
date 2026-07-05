import type { JurisdictionMembership } from "@/lib/types";
import { ALBERTA_ID, GLOBAL_ID } from "@/lib/types";

/**
 * The viewer's subscribed jurisdictions (cookie-shaped, works logged-out).
 * Mirrors the wireframe's `state.subs` — Global is the default; Alberta is added
 * here so the sample corpus is visible in the unified feed. Keyed by
 * jurisdiction id (labels resolve from JUR_DATA at render time).
 *
 * There is no server route today; persistence is a client cookie. See CONTRACT.md.
 */
export async function getJurisdictionMembership(): Promise<
  JurisdictionMembership[]
> {
  return [
    { id: GLOBAL_ID, included: true },
    { id: ALBERTA_ID, included: true },
  ];
}
