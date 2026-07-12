import { adjectives, animals, colors, names } from "unique-names-generator";
import { isBlockedPersonaWord } from "./persona-name-blocklist.js";

/** Max word length for persona display names (matches historical generator). */
export const PERSONA_NAME_MAX_WORD_LEN = 7;

function keep(word: string): boolean {
  return word.length <= PERSONA_NAME_MAX_WORD_LEN && !isBlockedPersonaWord(word);
}

/** First dictionary: short adjectives + colors, minus blocklist. */
export const PERSONA_NAME_ADJECTIVES: string[] = [...adjectives, ...colors].filter(keep);

/** Second dictionary: short animals + given names, minus blocklist. */
export const PERSONA_NAME_NOUNS: string[] = [...animals, ...names].filter(keep);

/** Dictionaries for `uniqueNamesGenerator` (`string[][]`, not readonly). */
export const PERSONA_NAME_DICTS: string[][] = [PERSONA_NAME_ADJECTIVES, PERSONA_NAME_NOUNS];

export type PersonaNamePoolStats = {
  adjectivesBefore: number;
  adjectivesAfter: number;
  nounsBefore: number;
  nounsAfter: number;
  spaceBefore: number;
  spaceAfter: number;
  bitsBefore: number;
  bitsAfter: number;
  bitsLost: number;
  relativeSpaceRetained: number;
};

/** Unfiltered pool sizes (length cap only) for entropy comparison. */
function unfilteredCounts(): { adjectives: number; nouns: number } {
  return {
    adjectives: [...adjectives, ...colors].filter((w) => w.length <= PERSONA_NAME_MAX_WORD_LEN).length,
    nouns: [...animals, ...names].filter((w) => w.length <= PERSONA_NAME_MAX_WORD_LEN).length,
  };
}

/** Combinatorial space size for `AdjectiveNoun` + `digits`-wide numeric suffix. */
export function personaNameSpaceSize(
  adjectiveCount: number,
  nounCount: number,
  digits = 2,
): number {
  return adjectiveCount * nounCount * 10 ** digits;
}

export function personaNameEntropyBits(spaceSize: number): number {
  return Math.log2(spaceSize);
}

/** Entropy before vs after blocklist (default 2-digit suffix). */
export function personaNamePoolStats(digits = 2): PersonaNamePoolStats {
  const before = unfilteredCounts();
  const adjectivesAfter = PERSONA_NAME_ADJECTIVES.length;
  const nounsAfter = PERSONA_NAME_NOUNS.length;
  const spaceBefore = personaNameSpaceSize(before.adjectives, before.nouns, digits);
  const spaceAfter = personaNameSpaceSize(adjectivesAfter, nounsAfter, digits);
  const bitsBefore = personaNameEntropyBits(spaceBefore);
  const bitsAfter = personaNameEntropyBits(spaceAfter);
  return {
    adjectivesBefore: before.adjectives,
    adjectivesAfter,
    nounsBefore: before.nouns,
    nounsAfter,
    spaceBefore,
    spaceAfter,
    bitsBefore,
    bitsAfter,
    bitsLost: bitsBefore - bitsAfter,
    relativeSpaceRetained: spaceAfter / spaceBefore,
  };
}
