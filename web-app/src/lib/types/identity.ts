/**
 * The viewer-resolved author identity attached to API-served DTOs.
 *
 * The frontend API layer (lib/api) rewrites `author`/`handle` on every record,
 * comment, and mention it returns, given the viewer's context; this object
 * carries the resolution so components can render persona affordances and
 * route taps to the right surface. Raw mock corpus objects never carry it.
 *
 * Marks (Signed / Official / Media / Platform / KYC) are resolved from sibling
 * author fields (`signTier`, `official`, `platformRole`, `tier`) by
 * EntityMarkGroup — not folded into this identity object.
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
  /**
   * DiceBear style when revealed/self. Omitted for personas — client picks
   * via effectivePersonaIconType(tier) (bottts unverified / initial-face verified).
   */
  iconType?: string;
  /** Root record id of the thread this identity was resolved within. */
  threadId: string;
  /**
   * Self only, when own effective visibility is not public: the persona name
   * out-of-scope viewers see instead (mask + persona name on own cards).
   */
  seenByOthersAs?: string;
}

/**
 * Narrow platform-role projection. Wire field is `platformRoles: string[]`;
 * client collapses to the single shipped role. Folded into EntityMarkGroup
 * alongside `official` and KYC `tier`.
 */
export type PlatformRole = "admin";
