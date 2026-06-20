// @oursay/identity — the pre-API client identity layer over @oursay/public-record.
//
// Import the focused subpaths in real code:
//   - `@oursay/identity/client` — passkey connectors (Web + Dev) + IdentitySession (signing).
//   - `@oursay/identity/server` — IdentityRegistry (enroll / join / prepare / submit).
// This root re-exports the shared DTOs that cross the client↔server boundary.

export type {
  ThreadRef,
  ParentRef,
  Intent,
  CreateIntent,
  MutateIntent,
  PreparedAppend,
  SignedSubmission,
  DeviceEnrollment,
  ThreadRegistration,
} from "./shared/types.js";
