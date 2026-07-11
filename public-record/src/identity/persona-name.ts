// Persona display names (docs/entities/civic-identity/thread-persona.md, C7). Each thread persona
// Pₜ gets a globally-unique public display name, minted at join: deterministic from the persona
// pubkey (`<Adjective><Animal><NN>` — the same style the web-app demo renders), widening the numeric
// suffix on collision. The name is PUBLIC (it is the persona page's key); the pubkey→name derivation
// leaks nothing about the user — the input is already the public persona key.
//
// Soft-mode mention reserved labels (mention-node.md) reuse the same display style but MUST be
// random (never derived from user_id / thread_id) — see `randomReservedLabelCandidate`.

import { randomBytes } from "node:crypto";
import { adjectives, colors, animals, names, uniqueNamesGenerator } from "unique-names-generator";

const NAME_DICTS = [
  [...adjectives, ...colors].filter((word) => word.length <= 7),
  [...animals, ...names].filter((word) => word.length <= 7),
] as const;

/** Deterministic 31-bit string hash (mirrors the web-app demo's `hashSeed` so styles match). */
export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The candidate persona name for a persona pubkey at a given suffix width. Deterministic:
 *  the same pubkey + digits always yields the same name (retry-on-collision widens `digits`). */
export function personaNameForPubkey(personaPubkey: string, digits = 2): string {
  const key = `persona::${personaPubkey}`;
  const words = uniqueNamesGenerator({
    dictionaries: [...NAME_DICTS],
    separator: "",
    style: "capital",
    seed: hashSeed(key),
  });
  const num = hashSeed(`${key}::n${digits}`) % 10 ** digits;
  return `${words}${String(num).padStart(digits, "0")}`;
}

/**
 * One random soft-mode reserved-label candidate (`AdjectiveAnimalNN` style). Not reversible from
 * user id — callers retry on collision with `mention_map.reserved_label` / `thread_keys.persona_name`.
 */
export function randomReservedLabelCandidate(digits = 2): string {
  const seed = randomBytes(4).readUInt32BE(0);
  const words = uniqueNamesGenerator({
    dictionaries: [...NAME_DICTS],
    separator: "",
    style: "capital",
    seed,
  });
  const num = randomBytes(4).readUInt32BE(0) % 10 ** digits;
  return `${words}${String(num).padStart(digits, "0")}`;
}
