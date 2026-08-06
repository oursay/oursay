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
  RootEntityRow,
  FeedRootRow,
  FeedRootsQuery,
  AuthorRootsQuery,
  AuthorActivityRow,
  StoredTx,
  StoredTxRef,
  OutboxStatus,
  AppendTxInput,
  ThreadBindingRow,
  MentionMapRow,
  MentionIndexRow,
} from "./private/store.js";
export { PublicChain, txHashOf } from "./ledger/chain.js";
export { TxIdAlreadyOnChainError, LedgerUnavailableError } from "./ledger/errors.js";

// Connectors (pluggable transport to the append-only chain)
export { PgWireLedgerConnector, ensureDatabaseExists, dropDatabase, listImmudbDatabases } from "./ledger/pgwire.connector.js";
export type { PgWireLedgerConnectorOptions } from "./ledger/pgwire.connector.js";
export { LedgerInstance } from "./ledger/instance.js";
export type { ForkLineage } from "./ledger/instance.js";
export type { LedgerConnector, LedgerRoot, RowVerification, ChainRow, BlockHeader, BlockAttestation } from "./ledger/connector.js";

// Block settlement (pool → append-only chain, on the trigger policy)
export { BlockSettler } from "./ledger/settler.js";
export type { SettleDecision, SettleOptions } from "./ledger/settler.js";

// Settlement worker (deadline-aware multi-chain loop driving settle + anchor; scripts/worker.ts)
export { SettlementWorker, realSleeper } from "./worker/settlement-worker.js";
export type {
  ChainRunner,
  SettlerLike,
  PublisherLike,
  Sleeper,
  Logger,
  ChainDecision,
  TickSummary,
  SettlementWorkerOptions,
} from "./worker/settlement-worker.js";

// Governance
export {
  rulesOf,
  resolveRules,
  withinDeadline,
  canChangeVote,
  canRevokeSignature,
} from "./governance.js";

// Jurisdiction (domain partition + router: id, level, default gating rules, per-action gates)
export { DEFAULT_CONTENT_LIMITS, DEFAULT_GATES, DEFAULT_LABELS, actionForType, gateFor, getJurisdiction, hasJurisdiction, registerJurisdiction, requireJurisdiction, requiredSignScheme } from "./jurisdiction.js";
export type { ActionGate, GateActor, GatedAction, JurisdictionConfig, JurisdictionContentLimits, JurisdictionCountExposure, JurisdictionGates, JurisdictionGraduation, JurisdictionLabels, JurisdictionPrivacy, JurisdictionRules, SignMethod } from "./jurisdiction.js";
// Persona display names (minted at join; the persona page key)
export { personaNameForPubkey, randomReservedLabelCandidate } from "./identity/persona-name.js";
export { PERSONA_NAME_ADJECTIVES, PERSONA_NAME_NOUNS, personaNamePoolStats } from "./identity/persona-name-dictionaries.js";
export { PERSONA_NAME_BLOCKLIST, isBlockedPersonaWord } from "./identity/persona-name-blocklist.js";

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
export {
  EvmAnchorTarget,
  UnsupportedEvmBundleError,
  onChainChainId,
  onChainDbId,
  computeEvmHeaderHash,
  createSharedEvmSigner,
  createEvmTargetsForChains,
} from "./anchor/evm.target.js";
export type { EvmAnchorTargetOptions } from "./anchor/evm.target.js";
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
// WebAuthn (ES256) per-thread civic signing (Option A) — one verifier + one builder (dev/tests).
export { verifyWebauthnAssertion, buildWebauthnAssertion, credentialPubkeyHex, base64urlEncode, base64urlDecode, verifyWebauthnAssertionForChallenge } from "./identity/webauthn.js";
export type { BuildAssertionInput } from "./identity/webauthn.js";
// Thread-scoped device signing (Method 3 §5.4) — multi-device / cross-device edit.
export { deriveDeviceThreadSigner, signEnvelopeWithDevice, deviceSignerDomainInfo } from "./identity/device.js";
export type { DeriveDeviceSignerInput, DeviceThreadSigner } from "./identity/device.js";
export { deriveNullifierSecret, threadNullifier } from "./identity/nullifier.js";
export { buildThreadBindingInputs } from "./identity/binding.js";
export type { ThreadBindingInputs, ThreadBindingPublic, ThreadBindingOpening, BuildBindingInput } from "./identity/binding.js";
// Server-side binding (platform signs/verifies the registration binding).
export { signBinding, verifyBinding, bindingDigest, platformPublicKey } from "./identity/platform-binding.js";
export { signNullifierAttestation, verifyNullifierAttestation, nullifierAttestationDigest } from "./identity/platform-binding.js";
export { signCredentialAuth, verifyCredentialAuth, credentialAuthDigest } from "./identity/platform-binding.js";
export type { CredentialAuthPayload } from "./identity/platform-binding.js";
export { verifyThreadBinding, bindingFromRow } from "./identity/verify.js";
// Platform-ops: admin clear-request attestation + platform-signed envelopes (threadless).
export {
  platformOpsRequestDigest,
  platformOpsRequestHash,
  signPlatformOpsRequestP256,
  verifyPlatformOpsRequestP256,
  verifyPlatformOpsAdminAttestation,
  buildPlatformOpsRequest,
  buildPlatformOpsAdminAttestationP256,
  buildPlatformOpsAdminAttestationWebauthn,
  buildPlatformOpsContent,
  platformOpsEntityId,
  buildAndSignPlatformOpsEnvelope,
  platformOpsSeatEntityId,
} from "./identity/platform-ops.js";

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
export { validateContent, validatePlatformOpsPayload } from "./schema/content.js";
export type {
  RecordType,
  Op,
  SignScheme,
  WebauthnAssertion,
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
  ResultContent,
  PlatformOpsKind,
  PlatformOpsRequest,
  PlatformOpsAdminAttestation,
  PlatformOpsContent,
  PlatformOpsPayloadByKind,
  JurisdictionConfigSetPayload,
  DistrictUpsertPayload,
  PlatformOpsDistrictSnapshot,
  OfficialSeatUpsertPayload,
  PlatformOpsOfficialSeatSnapshot,
} from "./schema/types.js";

// Config
export {
  immudbPgConfig,
  pgConfig,
  outboxConfig,
  chainConfig,
  ledgerConfig,
  jurisdictionConfig,
  blockConfig,
  anchorTargetsConfig,
  evmAnchorConfig,
  workerConfig,
  workerChainConfigs,
  identityConfig,
  paths,
  dbNameForChain,
  isLedgerIdUuid,
} from "./config.js";
export type {
  PgConfig,
  OutboxConfig,
  ChainConfig,
  LedgerConfig,
  BlockConfig,
  AnchorTargetsConfig,
  EvmAnchorConfig,
  WorkerConfig,
  WorkerChainConfig,
} from "./config.js";
