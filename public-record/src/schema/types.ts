// The OurSay public-record content model: event-sourced CRUD as append-only transactions.
//
// Every create / update / delete is a TRANSACTION. An entity (a post, a poll, a single
// reaction, …) is the fold of all its transactions, ordered by `seq`. The append-only chain
// keeps only hashes; the raw content lives in the mutable Postgres store.

/** The seven record (entity) types. */
export type RecordType =
  | "post"
  | "comment"
  | "reaction"
  | "petition"
  | "petition_signature"
  | "poll"
  | "vote";

/** The CRUD verb carried by a transaction. */
export type Op = "create" | "update" | "delete";

/** Reaction kinds. Mutually exclusive per (author, target); extensible later (custom emoji). */
export type ReactionKind = "check" | "cross";
export const REACTION_KINDS: ReactionKind[] = ["check", "cross"];

/** Max comment nesting depth (a comment may sit at most 3 levels below a root entity). */
export const COMMENT_MAX_DEPTH = 3;

/** Stub author identifier used for platform-authored governance transactions. */
export const PLATFORM_PUBKEY = "platform";

/**
 * Per-entity governance rules. Set by the entity's `create` transaction; updatable by a
 * platform-signed `update`. Govern whether votes may change / signatures may be revoked.
 * Defaults (absent / false) mean the real-world analog: a vote is cast and a petition is
 * signed FINAL, with no revocation.
 */
export interface EntityRules {
  appliesToDistrictIds?: string[]; // DISTRICT(s) this entity applies to (year-tagged ids, e.g. "edmonton-strathcona-2026"); absent/empty = the whole jurisdiction
  deadline?: string; // ISO 8601; after it, no change/revoke is permitted
  allowChange?: boolean; // poll: votes may change before deadline
  allowRevoke?: boolean; // petition: signatures may be revoked before deadline
}

/**
 * The canonical PUBLIC transaction envelope — the unit written to the append-only chain
 * (immudb) and committed-to in the private store. It NEVER contains the plaintext content;
 * it commits to it via `contentHash`.
 */
export interface TxEnvelope {
  v: 1;
  txId: string; // UUID — unique per transaction (the chain's primary key)
  type: RecordType; // entity type
  entityId: string; // stable id across the entity's whole lifecycle
  op: Op;
  parentType?: RecordType; // entity-level parent type (for attachments)
  parentId?: string; // entity-level parent id — FOLLOWS edits to the parent
  parentRevisionTxId?: string; // the parent's head tx id at attach time …
  parentRevisionHash?: string; // … its content-addressed revision id (parent txHash) — REVISION-level
  authorPubkey: string; // THREAD PERSONA — the stable public author id per (user, thread); PLATFORM_PUBKEY for governance
  signerPubkey?: string; // THREAD-SCOPED DEVICE key that produced `signature` (Method 3 §5.4). Absent ⇒ the persona signed.
  signature: string; // P-256 signature over the signing digest (or "unsigned" on the dev path)
  createdAt: string; // ISO 8601 — part of the hash
  prevHash: string | null; // per-entity link = txHash of the prior tx for entityId (null on create)
  contentHash: string; // salted commitment of THIS tx's content
  nullifier?: string; // singleton dedupe tag (vote/petition_signature/reaction); part of txHash, NOT contentHash
  proof?: string; // RESERVED Method-4 (§5.5) ZK membership proof slot. Unused now; appendSigned rejects if present.
}

// ── Validation tables ───────────────────────────────────────────────────────────────────

/** Root types take no parent; every other type attaches to one of the listed parent types. */
export const PARENT_RULES: Record<RecordType, RecordType[]> = {
  post: [],
  petition: [],
  poll: [],
  comment: ["post", "petition", "poll", "comment"],
  reaction: ["post", "comment"],
  petition_signature: ["petition"],
  vote: ["poll"],
};

/** Which CRUD ops each type permits at the model level (governance adds further gates). */
export const ALLOWED_OPS: Record<RecordType, Op[]> = {
  post: ["create", "update", "delete"],
  petition: ["create", "update", "delete"],
  poll: ["create", "update", "delete"],
  comment: ["create", "update", "delete"],
  reaction: ["create", "update", "delete"],
  petition_signature: ["create", "delete"], // delete = revoke (governance-gated)
  vote: ["create", "update"], // update = change (governance-gated); never deleted
};

/** "Singleton" types: at most one ACTIVE entity per (author, parent). */
export const SINGLETON_PER_AUTHOR_PARENT: RecordType[] = ["reaction", "vote", "petition_signature"];

export function isRootType(type: RecordType): boolean {
  return PARENT_RULES[type].length === 0;
}

export function opAllowed(type: RecordType, op: Op): boolean {
  return ALLOWED_OPS[type].includes(op);
}

export function parentAllowed(childType: RecordType, parentType: RecordType): boolean {
  return PARENT_RULES[childType].includes(parentType);
}

// ── Content shapes (guidance; stored as JSONB) ──────────────────────────────────────────

export interface PostContent {
  title?: string;
  body: string;
}
export interface CommentContent {
  body: string;
}
export interface ReactionContent {
  kind: ReactionKind;
}
export interface PetitionContent {
  title: string;
  text: string;
  rules?: EntityRules;
}
export interface PollContent {
  question: string;
  options: string[];
  rules?: EntityRules;
}
export interface VoteContent {
  option: string;
}
export interface PetitionSignatureContent {
  comment?: string;
}
/** Marker committed for a `delete` transaction (no plaintext to keep). */
export const DELETE_MARKER = { deleted: true } as const;
