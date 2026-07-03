import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import { hashSeed } from "@/lib/mock/comment-utils";

/**
 * Per-thread persona names (docs/entities/civic-identity/thread-persona.md, Pₜ).
 *
 * When an author's visibility excludes the viewer, they render as a stable
 * `<Adjective><Animal><NN>` pseudonym — the same name everywhere within one
 * thread (root record + its comments), a different one in every other thread.
 * Deterministic across reloads: seeded from (handle, threadId), never random
 * at render time.
 */

/** Deterministic persona name for (handle, thread) with an `digits`-wide numeric suffix. */
export function personaNameFor(handle: string, threadId: string, digits = 2): string {
  const key = `${handle}::${threadId}`;
  const words = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "",
    style: "capital",
    seed: hashSeed(key),
  });
  const num = hashSeed(`${key}::n${digits}`) % 10 ** digits;
  return `${words}${String(num).padStart(digits, "0")}`;
}

/**
 * Assign a persona name to every participant handle in a thread.
 *
 * Handles are deduplicated and sorted lexicographically before assignment so
 * the result is independent of traversal order; on a name collision the later
 * handle (in sort order) retries with one more suffix digit until unique.
 * Uniqueness is correctness-critical — components key lists by the displayed
 * handle, and the persona page resolves a persona from its name alone.
 *
 * Pass a shared `used` set to enforce uniqueness across threads (the persona
 * page's `/persona/<name>` lookup needs globally unique names); by default
 * uniqueness is per-thread. `nameAt` is injectable for tests that force
 * collisions.
 */
export function buildPersonaMap(
  participantHandles: string[],
  threadId: string,
  nameAt: (handle: string, threadId: string, digits: number) => string = personaNameFor,
  used: Set<string> = new Set(),
): Map<string, string> {
  const map = new Map<string, string>();
  const handles = [...new Set(participantHandles)].sort();
  for (const handle of handles) {
    let digits = 2;
    let name = nameAt(handle, threadId, digits);
    while (used.has(name)) {
      digits += 1;
      name = nameAt(handle, threadId, digits);
    }
    used.add(name);
    map.set(handle, name);
  }
  return map;
}
