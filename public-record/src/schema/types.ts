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

/**
 * The signature scheme that produced an envelope's signature.
 *   - `p256`           — a derived per-thread / thread-scoped device key signs the signing digest in
 *                        software (legacy / dual-verifier capability; the unsigned-dev path too).
 *   - `webauthn-es256` — a per-(device, thread) WebAuthn passkey produces a user-verifying assertion
 *                        whose challenge is bound to the signing digest. Under the mvp-a5b persona/signer
 *                        split, `authorPubkey` carries the stable thread persona Pₜ and `signerPubkey`
 *                        (REQUIRED) is this device's passkey pubkey — the assertion is verified against
 *                        `signerPubkey`, not `authorPubkey`. The ES256 signature rides inside
 *                        {@link WebauthnAssertion}; the top-level `signature` stays "".
 * Absent ⇒ `p256` (legacy envelopes hash byte-identically).
 */
export type SignScheme = "p256" | "webauthn-es256";

/**
 * A WebAuthn assertion (`navigator.credentials.get`) carried on the envelope so an OFFLINE verifier
 * can re-check the signature from the published chain leaf. All three fields are base64url (no pad):
 * `signature` is ASN.1 DER ECDSA (P-256), exactly as authenticators/browsers emit it. The signed
 * message is `authenticatorData || sha256(clientDataJSON)`, and `clientDataJSON.challenge` MUST equal
 * base64url(signingDigest(envelope)) — binding the whole envelope. The UV flag MUST be set.
 */
export interface WebauthnAssertion {
  authenticatorData: string; // base64url
  clientDataJSON: string; // base64url (UTF-8 JSON)
  signature: string; // base64url, ASN.1 DER ECDSA over sha256(authData || sha256(clientDataJSON))
}

// The geographic stake (appliesToRegion) is a RegionRef owned by @oursay/geo — a serializable
// reference (or and/or/not union) the resolver compiles into a Region. Type-only import: erased at
// runtime, so this stays a pure schema module with no geo runtime dependency.
import type { RegionRef } from "@oursay/geo";

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
  appliesToRegion?: RegionRef; // GEOGRAPHIC STAKE: a RegionRef ("jurisdiction" | "district:<district_slug>" | "revision:<revisionId>" | "region:<presetId>" | and/or/not union); absent = the whole jurisdiction
  /** @deprecated alias for {@link appliesToRegion}: a raw array of district REVISION ids (e.g.
   *  "edmonton-strathcona-2026"); absent/empty = whole jurisdiction. Still accepted during migration —
   *  the resolver maps it to an OR-of-revisions RegionRef and resolves it identically. Prefer `appliesToRegion`. */
  appliesToDistrictIds?: string[];
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
  authorPubkey: string; // stable thread persona Pₜ per (user, thread) — the public author on the record; identical across all of that user's devices; PLATFORM_PUBKEY for governance
  signerPubkey?: string; // webauthn-es256 (REQUIRED): this device's per-thread WebAuthn passkey pubkey — assertion verified against it, not authorPubkey. p256 path: thread-scoped DEVICE key that produced `signature` (Method 3 §5.4); absent ⇒ the persona signed.
  signScheme?: SignScheme; // how `signature`/`webauthn` were produced. Absent ⇒ "p256" (legacy envelopes hash unchanged).
  signature: string; // p256: ECDSA over the signing digest ("unsigned" on the dev path). WebAuthn path: "" (the ES256 sig lives in `webauthn`).
  webauthn?: WebauthnAssertion; // present if signScheme === "webauthn-es256". Blanked (like `signature`) in signingDigest; sealed populated in txHashOf.
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
  title: string;
  body?: string;
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
