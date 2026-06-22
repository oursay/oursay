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
  ThreadBindingRow,
} from "./private/store.js";
export { PublicChain, txHashOf } from "./ledger/chain.js";

// Connectors (pluggable transport to the append-only chain)
export { PgWireLedgerConnector } from "./ledger/pgwire.connector.js";
export type { LedgerConnector, LedgerRoot, RowVerification, ChainRow, BlockHeader, BlockAttestation } from "./ledger/connector.js";

// Block settlement (pool → append-only chain, on the trigger policy)
export { BlockSettler } from "./ledger/settler.js";
export type { SettleDecision, SettleOptions } from "./ledger/settler.js";

// Governance
export {
  rulesOf,
  resolveRules,
  withinDeadline,
  canChangeVote,
  canRevokeSignature,
} from "./governance.js";

// Jurisdiction (domain partition + router: id, level, default gating rules)
export { getJurisdiction, registerJurisdiction } from "./jurisdiction.js";
export type { JurisdictionConfig, JurisdictionRules } from "./jurisdiction.js";

// Projections (fold-on-read state)
export { getThread, reactionTallies } from "./projection.js";
export type { Thread, ThreadComment } from "./projection.js";

// Verification (live, against immudb)
export { verifyEntityChain } from "./verify.js";
export type { ChainReport, TxVerdict } from "./verify.js";

// Block bundle assembly + external anchoring (settled block → published bundle, per-target cadence)
export { BundleAssembler } from "./anchor/assembler.js";
export type { AssembleOptions } from "./anchor/assembler.js";
export { AnchorPublisher } from "./anchor/publisher.js";
export { FileAnchorTarget } from "./anchor/file.target.js";
export { everyNBlocks } from "./anchor/target.js";
export type { AnchorTarget, AnchorPublishPolicy } from "./anchor/target.js";
export type { AnchorRecord, BlockBundle, BlockEntry, ImmudbRootRef } from "./anchor/types.js";

// Offline anchor verifier (no DB / no platform)
export { verifyEntry, verifyBlock, verifyChainLink, verifyChain, computeChainTipHash } from "./anchor/verify.js";
export type { EntryVerdict, BlockReport } from "./anchor/verify.js";

// Crypto (also what an independent auditor reimplements against)
export { canonicalJson, contentCommitment, newSalt, sha256Hex, threadCommitment } from "./crypto/commitment.js";
export type { ThreadCommitmentInput } from "./crypto/commitment.js";
export { hashLeaf, merkleRoot, merkleProof, verifyMerkleProof } from "./crypto/merkle.js";
export type { MerkleStep } from "./crypto/merkle.js";

// Identity — per-thread keys, envelope signing, binding inputs (promoted from passkey-test).
// Browser-safe client helpers; also re-exported via the "./identity/*" subpaths.
export { deriveThreadKey, deriveThreadPrivateKey, threadDomainInfo } from "./identity/derive.js";
export type { DeriveInput, ThreadKey } from "./identity/derive.js";
export { signEnvelope, verifyEnvelope, signingDigest, UNSIGNED } from "./identity/envelope.js";
export type { SignResult } from "./identity/envelope.js";
// Thread-scoped device signing (Method 3 §5.4) — multi-device / cross-device edit.
export { deriveDeviceThreadSigner, signEnvelopeWithDevice, deviceSignerDomainInfo } from "./identity/device.js";
export type { DeriveDeviceSignerInput, DeviceThreadSigner } from "./identity/device.js";
export { deriveNullifierSecret, threadNullifier } from "./identity/nullifier.js";
export { buildThreadBindingInputs } from "./identity/binding.js";
export type { ThreadBindingInputs, ThreadBindingPublic, ThreadBindingOpening, BuildBindingInput } from "./identity/binding.js";
// Server-side binding (platform signs/verifies the registration binding).
export { signBinding, verifyBinding, bindingDigest, platformPublicKey } from "./identity/platform-binding.js";
export { signNullifierAttestation, verifyNullifierAttestation, nullifierAttestationDigest } from "./identity/platform-binding.js";
export { verifyThreadBinding, bindingFromRow } from "./identity/verify.js";

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
export { immudbPgConfig, pgConfig, outboxConfig, chainConfig, jurisdictionConfig, blockConfig, anchorTargetsConfig } from "./config.js";
export type { PgConfig, OutboxConfig, ChainConfig, BlockConfig, AnchorTargetsConfig } from "./config.js";
