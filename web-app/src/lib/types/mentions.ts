/**
 * Server-resolved mention display for one opaque token
 * (`docs/entities/civic-identity/mention-node.md`). Client never re-derives privacy.
 */

export type MentionKind = "reserved" | "persona" | "profile";

export interface ResolvedMention {
  display: string;
  kind: MentionKind;
  /** Profile/persona path when linkable; omitted for reserved / Someone. */
  route?: string;
  isSelf: boolean;
}

/** nodeId → resolved mention metadata. Absent when content has no well-formed tokens. */
export type MentionsMap = Record<string, ResolvedMention>;
