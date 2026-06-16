// @oursay/public-record — event-sourced civic record over an append-only verifiable chain
// (immudb) + a private mutable store (Postgres). Public surface.

// Orchestrator
export { RecordService } from "./record.js";
export type { Ref } from "./record.js";

// Stores & chain
export { PrivateStore, toPublicView } from "./private/store.js";
export type {
  EntityState,
  PublicEntityView,
  ReactionCount,
  StoredTx,
  AppendTxInput,
} from "./private/store.js";
export { PublicChain, txHashOf } from "./ledger/chain.js";

// Connectors (pluggable transport to the append-only chain)
export { PgWireLedgerConnector } from "./ledger/pgwire.connector.js";
export type { LedgerConnector, LedgerRoot, RowVerification, ChainRow } from "./ledger/connector.js";

// Governance
export {
  rulesOf,
  withinDeadline,
  canChangeVote,
  canRevokeSignature,
} from "./governance.js";

// Projections (fold-on-read state)
export { getThread, reactionTallies } from "./projection.js";
export type { Thread, ThreadComment } from "./projection.js";

// Verification
export { verifyEntityChain } from "./verify.js";
export type { ChainReport, TxVerdict } from "./verify.js";

// Crypto (also what an independent auditor reimplements against)
export { canonicalJson, contentCommitment, newSalt, sha256Hex } from "./crypto/commitment.js";
export { hashLeaf, merkleRoot, merkleProof, verifyMerkleProof } from "./crypto/merkle.js";
export type { MerkleStep } from "./crypto/merkle.js";

// Schema / model
export {
  PARENT_RULES,
  ALLOWED_OPS,
  REACTION_KINDS,
  COMMENT_MAX_DEPTH,
  PLATFORM_PUBKEY,
  SINGLETON_PER_AUTHOR_PARENT,
  isRootType,
  opAllowed,
  parentAllowed,
} from "./schema/types.js";
export type {
  RecordType,
  Op,
  ReactionKind,
  EntityRules,
  TxEnvelope,
  PostContent,
  CommentContent,
  ReactionContent,
  PetitionContent,
  PollContent,
  VoteContent,
  PetitionSignatureContent,
} from "./schema/types.js";

// Config
export { immudbPgConfig, pgConfig } from "./config.js";
export type { PgConfig } from "./config.js";
