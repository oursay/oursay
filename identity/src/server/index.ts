// @oursay/identity/server — in-process verified-write helpers. The future @oursay/api wraps these.

export { IdentityRegistry } from "./registry.js";
export type { IdentityRegistryOptions } from "./registry.js";

// Shared DTOs the server surface speaks.
export type {
  Intent,
  CreateIntent,
  MutateIntent,
  PreparedAppend,
  SignedSubmission,
  DeviceEnrollment,
  ThreadRegistration,
} from "../shared/types.js";
