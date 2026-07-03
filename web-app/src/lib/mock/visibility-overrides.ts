import type { AuthorVisibility } from "@/lib/types/visibility";

/**
 * Per-(record, author) thread-level visibility overrides — the cascade's
 * `thread` layer (docs/09 §2). An override may only NARROW the author's
 * account default; resolveVisibility clamps widening attempts.
 */
export const THREAD_VISIBILITY_OVERRIDES: Record<
  string,
  Record<string, AuthorVisibility>
> = {
  // samd's account is all_officials, but he narrowed his own petition thread
  // to anonymous: even a tier-3 viewer sees his persona here while his
  // comments elsewhere reveal at tier 3 — demonstrates the cascade.
  "pet-sam-109st": { samd: "anonymous" },
  // Widening attempt (id_verified over dwhitecloud's anonymous account).
  // Deliberately kept as the narrow-only regression fixture: the resolver
  // ignores it and dwhitecloud stays a persona on this thread too.
  "stmt-dana-transit": { dwhitecloud: "id_verified" },
};
