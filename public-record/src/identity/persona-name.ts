// Persona display names (docs/entities/civic-identity/thread-persona.md, C7). Each thread persona
// Pₜ gets a globally-unique public display name, minted at join: deterministic from the persona
// pubkey (`<Adjective><Animal><NN>` — the same style the web-app demo renders), widening the numeric
// suffix on collision. The name is PUBLIC (it is the persona page's key); the pubkey→name derivation
// leaks nothing about the user — the input is already the public persona key.

import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";

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
    dictionaries: [adjectives, animals],
    separator: "",
    style: "capital",
    seed: hashSeed(key),
  });
  const num = hashSeed(`${key}::n${digits}`) % 10 ** digits;
  return `${words}${String(num).padStart(digits, "0")}`;
}
