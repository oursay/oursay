/**
 * The viewer-resolved author identity attached to API-served DTOs.
 *
 * The frontend API layer (lib/api) rewrites `author`/`handle` on every record,
 * comment, and mention it returns, given the viewer's context; this object
 * carries the resolution so components can render persona affordances and
 * route taps to the right surface. Raw mock corpus objects never carry it.
 *
 * TODO(marks[]): unify Signed / Platform / Media / KYC into `marks: AuthorMark[]`
 * on author DTOs (see .agents/plans/V1-ROADMAP.md Phase V1-A author mark model).
 * V1-A ships a narrow `platformRole` sibling field instead — do not expand this
 * identity object into a marks iterator until that migration.
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
 * Narrow V1-A platform-role projection (route b). Wire field is `platformRoles: string[]`;
 * client collapses to the single shipped role. TODO(marks[]): fold into AuthorMark[]
 * (see .agents/plans/V1-ROADMAP.md).
 */
export type PlatformRole = "admin";
