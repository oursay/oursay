/**
 * The viewer-resolved author identity attached to API-served DTOs.
 *
 * The frontend API layer (lib/api) rewrites `author`/`handle` on every record,
 * comment, and mention it returns, given the viewer's context; this object
 * carries the resolution so components can render persona affordances and
 * route taps to the right surface. Raw mock corpus objects never carry it.
 */
export interface AuthorIdentity {
  /** Real display name when revealed/self; per-thread persona name otherwise. */
  display: string;
  /** Real handle iff revealed or self; null for personas (never leaked). */
  handle: string | null;
  isPersona: boolean;
  isSelf: boolean;
  /** Avatar seed: real handle when revealed, persona name otherwise. */
  seed: string;
  /** Root record id of the thread this identity was resolved within. */
  threadId: string;
  /**
   * Self only, when own effective visibility is not public: the persona name
   * out-of-scope viewers see instead ("seen as <persona>" hint).
   */
  seenByOthersAs?: string;
}
