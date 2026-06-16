// Shared types for the OurSay immudb evaluation.

/** The five public, verifiable object types. Each becomes a key prefix in immudb. */
export type RecordType = "post" | "reaction" | "comment" | "poll" | "vote";

/**
 * The canonical PUBLIC envelope. This — and only this — is written to the immudb
 * verifiable ledger. It commits to the content via `contentHash` but NEVER contains
 * the raw content itself. Raw content + salt live in the private (Postgres) store.
 */
export interface PublicEnvelope {
  v: 1;
  type: RecordType;
  id: string;
  parentId?: string; // e.g. a comment's post, a vote's poll
  authorRef: string; // pseudonymous author handle / pubkey ref (public)
  createdAt: string; // ISO 8601
  contentHash: string; // hex sha256 commitment (salted) — see commitment.ts
}

/** The private record retained in Postgres. Erasable. */
export interface PrivateContent {
  id: string;
  salt: string; // hex, 32 bytes — the blinding factor making the commitment hiding
  content: unknown; // raw plaintext / structured content (e.g. {option:"yes"})
  redactedAt: string | null; // set => withhold from public export (still retained here)
  erasedAt: string | null; // set => content physically removed (true erasure)
}

/** immudb's cryptographic state = the root we anchor for append-only integrity. */
export interface ImmudbRoot {
  db: string;
  serverUuid: string;
  txid: number;
  txhashHex: string;
}

/** One step of a Merkle inclusion proof: a sibling hash and which side it is on. */
export interface MerkleStep {
  hash: string; // hex
  side: "left" | "right"; // side the sibling sits on, relative to the running hash
}

/** One entry in an exported public audit bundle. */
export interface BundleEntry {
  key: string; // immudb key, e.g. "post:<id>"
  envelope: PublicEnvelope;
  leafHash: string; // hex sha256 of the canonical envelope (Merkle leaf)
  merkleProof: MerkleStep[]; // sibling hashes, leaf -> root
  // Disclosure: present for revealed entries, ABSENT for redacted/erased entries.
  reveal?: { salt: string; content: unknown };
}

/** The anchor record — the small object published to external infra (GitHub / chain). */
export interface AnchorRecord {
  v: 1;
  ledgerDb: string;
  capturedAt: string;
  txCount: number;
  immudbRoot: { txid: number; txhashHex: string }; // append-only authority
  bundleMerkleRoot: string; // hex — enables offline third-party verification
}

/** A full exported bundle: what we would publish to a public GitHub repo. */
export interface PublicBundle {
  anchor: AnchorRecord;
  entries: BundleEntry[];
}
