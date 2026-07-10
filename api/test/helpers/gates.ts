// FIXTURE seam for READ-MODEL specs: re-register a jurisdiction with the platform-default (fully
// open) act gates while KEEPING its counts/privacy/labels/rules policy. Those specs seed record
// states that are only reachable through state DRIFT under the real write gates (e.g. a vote from a
// user who later lost their point, or an unverified signer on a tier-gated petition) — driving each
// fixture through that multi-step drift would slow the suite and test nothing extra. Write-path
// gate enforcement itself is covered table-driven in 20-gates.spec.ts.

import { getJurisdiction, registerJurisdiction } from "@oursay/public-record";
import { jurisdictions } from "@oursay/jurisdiction-data";

/** Strip the act gates off the named jurisdictions (platform DEFAULT_GATES apply: anyone + quick).
 *  Returns a restore hook that re-registers the packaged configs — call it in after(). */
export function openGates(...jurisdictionIds: string[]): () => void {
  for (const id of jurisdictionIds) {
    const j = getJurisdiction(id);
    registerJurisdiction({ ...j, gates: undefined });
  }
  return () => {
    for (const j of jurisdictions) registerJurisdiction(j);
  };
}
