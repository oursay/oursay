import type { AuthorVisibility } from "@/lib/types/visibility";

/**
 * Per-(record, author) thread-level visibility overrides — the cascade's
 * `thread` layer. The account default is only a default; a thread override
 * wins outright and may widen OR narrow the author's visibility on that thread.
 */
export const THREAD_VISIBILITY_OVERRIDES: Record<
  string,
  Record<string, AuthorVisibility>
> = {
  // samd's account is all_officials, but he narrowed his own petition thread
  // to anonymous: even a tier-3 viewer sees his persona here while his
  // comments elsewhere reveal at tier 3 — demonstrates a narrowing override.
  "pet-sam-109st": { samd: "anonymous" },
  // dwhitecloud's account is anonymous, but he widened this one thread to
  // id_verified — so he reveals to tier-1+ viewers here only. Demonstrates a
  // widening override (thread beats account in either direction).
  "stmt-dana-transit": { dwhitecloud: "id_verified" },
};
