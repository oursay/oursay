// @oursay/identity/server — in-process verified-write helpers. @oursay/api wraps these as HTTP.

export { IdentityRegistry } from "./registry.js";
export type { IdentityRegistryOptions } from "./registry.js";

// Shared DTOs the server surface speaks.
export type {
  Intent,
  CreateIntent,
  MutateIntent,
  PreparedAppend,
  MentionCandidate,
  MentionNodeRef,
  SignedSubmission,
  DeviceEnrollment,
  ThreadRegistration,
  JoinThreadResponse,
} from "../shared/types.js";
