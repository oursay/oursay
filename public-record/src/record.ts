import { randomUUID } from "node:crypto";
import { canonicalJson, contentCommitment, newSalt } from "./crypto/commitment.js";
import { identityConfig } from "./config.js";
import { canRevokeSignature, canChangeVote } from "./governance.js";
import { requiredSignScheme } from "./jurisdiction.js";
import { verifyEnvelope } from "./identity/envelope.js";
import { verifyThreadBinding } from "./identity/verify.js";
import { platformPublicKey, signNullifierAttestation } from "./identity/platform-binding.js";
import type { PublicChain } from "./ledger/chain.js";
import type { PrivateStore, StoredTx } from "./private/store.js";
import {
  ALLOWED_OPS,
  COMMENT_MAX_DEPTH,
  DELETE_MARKER,
  PLATFORM_PUBKEY,
  REACTION_KINDS,
  SINGLETON_PER_AUTHOR_PARENT,
  isRootType,
  opAllowed,
  parentAllowed,
  type EntityRules,
  type Op,
  type ReactionKind,
  type RecordType,
  type TxEnvelope,
} from "./schema/types.js";

void ALLOWED_OPS; // referenced via opAllowed; kept for re-export discoverability

/** A reference to an appended transaction. */
export interface Ref {
  txId: string;
  entityId: string;
  txHash: string;
}

interface ParentRef {
  type: RecordType;
  id: string;
}

interface AppendSpec {
  type: RecordType;
  entityId: string;
  op: Op;
  author: string;
  parent?: ParentRef;
  parentRevisionHash?: string;
  parentRevisionTxId?: string;
  prevHash: string | null;
  content: unknown;
  createdAt?: string;
  signature?: string;
}

/**
 * The high-level orchestrator: turns create/update/delete intents into validated, append-only
 * transactions written to both stores. Each create/update writes a FULL content snapshot, so
 * the fold-on-read views resolve current state by "latest snapshot wins".
 */
export class RecordService {
  private readonly platformPrivKeyHex?: string;
  private readonly platformPubKeyHex?: string;
  private readonly signedEnvelopeMaxAgeSec: number;
  private readonly signedEnvelopeFutureSkewSec: number;
  private readonly requireDeviceSigner: boolean;
  private readonly enforceSigningPolicy: boolean;
  private readonly now: () => number;

  constructor(
    private readonly chain: PublicChain,
    private readonly store: PrivateStore,
    opts?: {
      platformBindingPubKeyHex?: string;
      platformBindingPrivKeyHex?: string;
      /** Override the signed-envelope freshness window (seconds); `0` disables. Defaults to config. */
      signedEnvelopeMaxAgeSec?: number;
      /** Override the accepted future-clock-skew (seconds). Defaults to config. */
      signedEnvelopeFutureSkewSec?: number;
      /** Require a thread-scoped device signer on every signed envelope (legacy p256 path). Defaults to config. */
      requireDeviceSigner?: boolean;
      /** Enforce the jurisdiction signing policy — incl. the hard webauthn-es256 requirement for
       *  vote/petition_signature (Option A). Default true (fail-closed, production). Engine-capability
       *  tests that exercise the raw p256 path on forced types may set this false. */
      enforceSigningPolicy?: boolean;
      /** Injectable clock (ms since epoch) for tests; defaults to `Date.now`. */
      now?: () => number;
    },
  ) {
    this.platformPrivKeyHex = opts?.platformBindingPrivKeyHex;
    this.platformPubKeyHex =
      opts?.platformBindingPubKeyHex ??
      (this.platformPrivKeyHex ? platformPublicKey(this.platformPrivKeyHex) : undefined);
    this.signedEnvelopeMaxAgeSec = opts?.signedEnvelopeMaxAgeSec ?? identityConfig.signedEnvelopeMaxAgeSec;
    this.signedEnvelopeFutureSkewSec = opts?.signedEnvelopeFutureSkewSec ?? identityConfig.signedEnvelopeFutureSkewSec;
    this.requireDeviceSigner = opts?.requireDeviceSigner ?? identityConfig.requireDeviceSigner;
    this.enforceSigningPolicy = opts?.enforceSigningPolicy ?? true;
    this.now = opts?.now ?? Date.now;
  }

  // ── Verified-tier signed path (client-builds-and-signs; promoted from passkey-test) ──────

  /**
   * Server-derived fields the client needs to assemble a canonical envelope it can sign. Pure read.
   * Creates return `nullifierParentId` (the parent the client must scope a NEW nullifier to);
   * updates/deletes return the head `prevHash`, the PRESERVED parent revision, and the EXISTING
   * `nullifier` (singleton entities) so the client carries it forward — never re-minted.
   */
  async prepareAppend(input: {
    op: Op;
    type?: RecordType;
    author: string;
    parent?: ParentRef;
    entityId?: string;
    content?: unknown;
  }): Promise<{
    prevHash: string | null;
    parentType?: RecordType;
    parentId?: string;
    parentRevisionHash?: string;
    parentRevisionTxId?: string;
    rootEntityId: string;
    nullifierParentId?: string;
    nullifier?: string;
  }> {
    if (input.op === "create") {
      if (!input.type) throw new Error("prepareAppend: create requires a type");
      const entityId = input.entityId ?? randomUUID();
      const r = await this.validateCreate({
        type: input.type,
        author: input.author,
        content: input.content ?? {},
        parent: input.parent,
        entityId,
      });
      return {
        prevHash: null,
        parentRevisionHash: r.parentRevisionHash,
        parentRevisionTxId: r.parentRevisionTxId,
        rootEntityId: r.rootEntityId,
        nullifierParentId: r.isSingleton && input.parent ? input.parent.id : undefined,
      };
    }
    if (!input.entityId) throw new Error("prepareAppend: update/delete requires entityId");
    const v =
      input.op === "update"
        ? await this.validateUpdate(input.entityId, input.author)
        : await this.validateDelete(input.entityId, input.author);
    return {
      prevHash: v.head.txHash,
      parentType: v.head.parentType ?? undefined,
      parentId: v.head.parentId ?? undefined,
      parentRevisionHash: v.head.parentRevisionHash ?? undefined,
      parentRevisionTxId: v.head.parentRevisionTxId ?? undefined,
      rootEntityId: v.rootEntityId,
      nullifier: v.head.nullifier ?? undefined,
    };
  }

  /**
   * Accept a CLIENT-SIGNED envelope into the pool, gated by the verified-tier checks. Covers the
   * full civic op surface — `create` (2a) and `update`/`delete` (2b). Shared pre-checks for all ops:
   *   1. P-256 signature verifies against `authorPubkey`; `{salt,content}` reproduce `contentHash`;
   *   2. the thread key is REGISTERED (binding exists + `binding_sig` re-verifies); thread-scope holds.
   * **create:** content-model rules (`validateCreate`); parent-revision concurrency; **nullifier gate**
   *   for singletons — `envelope.nullifier` equals the platform-attested nullifier for `(user,parentId)`
   *   (minted+signed here on first use) and no active singleton on that parent already bears it (the
   *   authoritative one-per-(user,parent) dedupe).
   * **update/delete:** `validateUpdate`/`validateDelete` (op rules + governance); **cryptographic
   *   author-match** (signature proves control of `authorPubkey`, which must equal the entity's
   *   author); **optimistic concurrency** — `envelope.prevHash` must equal the current head and the
   *   parent/parent-revision must be preserved (stale ⇒ reject-and-retry); a `delete` carries
   *   `DELETE_MARKER`; singleton update/delete **carry the original nullifier forward** (no re-mint,
   *   no dup-check). The unsigned dev path (`create`/`update`/`delete`) shares the same validators.
   */
  async appendSigned(input: { envelope: TxEnvelope; salt: string; content: unknown }): Promise<Ref> {
    const { envelope, salt, content } = input;
    if (envelope.op !== "create" && envelope.op !== "update" && envelope.op !== "delete") {
      throw new Error(`appendSigned: unsupported op '${envelope.op}'`);
    }
    if (!this.platformPubKeyHex) throw new Error("appendSigned: platform binding key not configured");
    // Reserved Method-4 (§5.5) ZK slot: the wire format carries `proof`, but verification is not built
    // yet — reject rather than silently accepting an unverified proof-looking field.
    if (envelope.proof !== undefined) throw new Error("appendSigned: ZK membership proof not yet supported");

    // Signing-scheme policy + shape. The scheme is `p256` unless declared `webauthn-es256`.
    const scheme = envelope.signScheme ?? "p256";
    // Jurisdiction policy (hard override for vote/petition_signature → webauthn-es256). Resolved by
    // record type; applies to create/update/delete alike. Fail-closed by default; engine-capability
    // tests of the raw p256 path may disable it.
    if (this.enforceSigningPolicy) {
      const need = requiredSignScheme(envelope.type);
      if (need && need !== scheme) {
        throw new Error(`appendSigned: ${envelope.type} requires ${need} signatures`);
      }
    }
    if (scheme === "webauthn-es256") {
      // The thread passkey IS the sole civic identity: author = the credential pubkey, no signer.
      if (!envelope.webauthn) throw new Error("appendSigned: a webauthn-es256 envelope requires a webauthn assertion");
      if (envelope.signerPubkey) throw new Error("appendSigned: a webauthn-es256 envelope must not carry a signerPubkey");
      if (envelope.signature) throw new Error("appendSigned: a webauthn-es256 envelope must leave signature empty (the sig lives in webauthn)");
    } else {
      if (envelope.webauthn) throw new Error("appendSigned: a p256 envelope must not carry a webauthn assertion");
      // Production hardening (legacy p256 path): optionally require a thread-scoped device signer.
      if (this.requireDeviceSigner && !envelope.signerPubkey) {
        throw new Error("appendSigned: a thread-scoped device signer is required");
      }
    }
    if (!verifyEnvelope(envelope)) throw new Error("appendSigned: invalid per-thread signature");

    const expected = contentCommitment({ id: envelope.txId, salt, content });
    if (expected !== envelope.contentHash) throw new Error("appendSigned: contentHash does not match salt+content");

    if (!(await verifyThreadBinding(this.store, envelope.authorPubkey, this.platformPubKeyHex))) {
      throw new Error("appendSigned: thread key is not registered (verified tier required)");
    }

    // Freshness gate (all signed ops): reject a `createdAt` that is too old, or too far ahead of the
    // server clock. Disabled when maxAge = 0. `createdAt` is part of the signing digest, so this
    // needs no schema/wire change. Clients MUST set `createdAt` at SIGN time, not prepare time.
    if (this.signedEnvelopeMaxAgeSec > 0) {
      const createdAtMs = Date.parse(envelope.createdAt);
      if (Number.isNaN(createdAtMs)) throw new Error("appendSigned: envelope createdAt is not a valid ISO 8601 timestamp");
      const deltaSec = (this.now() - createdAtMs) / 1000; // > 0 = in the past
      if (deltaSec > this.signedEnvelopeMaxAgeSec) throw new Error("appendSigned: envelope createdAt expired");
      if (-deltaSec > this.signedEnvelopeFutureSkewSec) throw new Error("appendSigned: envelope createdAt is in the future beyond allowed clock skew");
    }

    // thread-scope: the AUTHOR is the thread persona — it must be the registered thread key for this
    // action's root. (`authorPubkey` is a public label; with device signing the persona key need not
    // sign, so this lookup — not a persona signature — is what binds the author to a verified user.)
    const tk = await this.store.getThreadKey(envelope.authorPubkey);
    if (!tk) throw new Error("appendSigned: unknown thread key");

    if (scheme === "webauthn-es256") {
      // Revoke enforcement (Option A): the thread passkey credential (credential_pubkey =
      // authorPubkey) must be registered for this author and not revoked. This is the per-thread
      // "revoke this credential" handle that replaces the device-signer revoke path.
      const cred = await this.store.getThreadCredential(envelope.authorPubkey);
      if (!cred) throw new Error("appendSigned: thread credential is not registered");
      if (cred.revoked) throw new Error("appendSigned: thread credential is revoked");
      if (cred.userId !== tk.userId) throw new Error("appendSigned: thread credential is not the author's");
    } else if (envelope.signerPubkey) {
      // Device-signer authorization (Method 3 §5.4, legacy p256 path): when the envelope is signed by
      // a thread-scoped device key, that signer must belong to the SAME verified user as the persona
      // (the dedupe / authorization boundary) AND be scoped to the SAME thread (no cross-thread signer
      // reuse). Any enrolled, non-revoked device of that user may thus act for the persona — including
      // editing content first written from another device (cross-device edit, §5.4 rule 6).
      const sgn = await this.store.getThreadSigner(envelope.signerPubkey);
      if (!sgn) throw new Error("appendSigned: signer is not a registered device for this thread");
      if (sgn.revoked) throw new Error("appendSigned: signer (or its device) is revoked");
      if (sgn.userId !== tk.userId) throw new Error("appendSigned: signer is not enrolled to the author's user");
      if (sgn.threadId !== tk.threadId) throw new Error("appendSigned: signer is not scoped to this thread");
    }

    const parent =
      envelope.parentType && envelope.parentId ? { type: envelope.parentType, id: envelope.parentId } : undefined;

    if (envelope.op === "create") {
      if (envelope.prevHash !== null) throw new Error("appendSigned: a create must have prevHash=null");
      const r = await this.validateCreate({ type: envelope.type, author: envelope.authorPubkey, content, parent, entityId: envelope.entityId });
      if (tk.threadId !== r.rootEntityId) {
        throw new Error("appendSigned: thread key is not scoped to this action's root entity");
      }
      // optimistic concurrency: parent revision the client signed must still be current.
      if ((envelope.parentRevisionHash ?? undefined) !== r.parentRevisionHash) {
        throw new Error("appendSigned: stale parent revision; re-prepare and re-sign");
      }
      // nullifier gate (authoritative singleton dedupe).
      if (r.isSingleton) {
        if (!parent) throw new Error("appendSigned: a singleton action requires a parent");
        if (!envelope.nullifier) throw new Error("appendSigned: singleton create requires a nullifier");
        const attested = await this.store.getAttestedNullifier(tk.userId, parent.id);
        if (attested && attested !== envelope.nullifier) {
          throw new Error("appendSigned: nullifier does not match the attested one for (user, parent)");
        }
        if (!attested) {
          if (!this.platformPrivKeyHex) throw new Error("appendSigned: platform private key required to attest a nullifier");
          const sig = signNullifierAttestation(parent.id, envelope.nullifier, this.platformPrivKeyHex);
          await this.store.attestNullifier({ userId: tk.userId, parentId: parent.id, nullifier: envelope.nullifier, platformSig: sig });
        }
        if (await this.store.hasActiveSingletonByNullifier(parent.id, envelope.nullifier)) {
          throw new Error("appendSigned: an active singleton with this nullifier already exists on the parent (update instead)");
        }
      } else if (envelope.nullifier) {
        throw new Error("appendSigned: a non-singleton create must not carry a nullifier");
      }
    } else {
      // ── update / delete ──
      const head = await this.store.getHeadTx(envelope.entityId);
      if (!head) throw new Error(`appendSigned: entity ${envelope.entityId} not found`);
      // optimistic concurrency on the per-entity head.
      if (envelope.prevHash !== head.txHash) throw new Error("appendSigned: stale prevHash; re-prepare and re-sign");
      // author-match (proven by the signature over authorPubkey) + governance + op rules.
      const v =
        envelope.op === "update"
          ? await this.validateUpdate(envelope.entityId, envelope.authorPubkey)
          : await this.validateDelete(envelope.entityId, envelope.authorPubkey);
      if (tk.threadId !== v.rootEntityId) {
        throw new Error("appendSigned: thread key is not scoped to this action's root entity");
      }
      // preserved fields: an update/delete may not move the parent or re-pin the parent revision.
      if (
        (envelope.parentType ?? undefined) !== (head.parentType ?? undefined) ||
        (envelope.parentId ?? undefined) !== (head.parentId ?? undefined) ||
        (envelope.parentRevisionHash ?? undefined) !== (head.parentRevisionHash ?? undefined)
      ) {
        throw new Error("appendSigned: update/delete must preserve the original parent and parent revision");
      }
      if (envelope.op === "delete" && canonicalJson(content) !== canonicalJson(DELETE_MARKER)) {
        throw new Error("appendSigned: a delete must carry the DELETE_MARKER content");
      }
      // nullifier carry-forward (no mint, no dup-check): singleton edits keep the original nullifier.
      if (SINGLETON_PER_AUTHOR_PARENT.includes(head.type)) {
        if (!head.nullifier) throw new Error("appendSigned: singleton entity has no nullifier to carry forward");
        if (envelope.nullifier !== head.nullifier) {
          throw new Error("appendSigned: a singleton update/delete must carry the original nullifier");
        }
      } else if (envelope.nullifier) {
        throw new Error("appendSigned: a non-singleton update/delete must not carry a nullifier");
      }
    }

    const { txHash } = await this.chain.append(envelope, { salt, content });
    return { txId: envelope.txId, entityId: envelope.entityId, txHash };
  }

  // ── Shared validation (used by the unsigned dev path AND the signed path) ────────────────

  /** Validate a CREATE intent and resolve the server-derived fields. Throws on any rule violation.
   *  Does NOT enforce dedupe — the caller applies it (unsigned: getActiveSingleton; signed: nullifier). */
  private async validateCreate(i: {
    type: RecordType;
    author: string;
    content: unknown;
    parent?: ParentRef;
    entityId: string;
  }): Promise<{ parentRevisionHash?: string; parentRevisionTxId?: string; rootEntityId: string; isSingleton: boolean }> {
    if (!opAllowed(i.type, "create")) throw new Error(`create not allowed for ${i.type}`);
    let parentRevisionHash: string | undefined;
    let parentRevisionTxId: string | undefined;
    let rootEntityId = i.entityId;

    if (isRootType(i.type)) {
      if (i.parent) throw new Error(`${i.type} is a root type and takes no parent`);
    } else {
      const parent = i.parent;
      if (!parent) throw new Error(`${i.type} requires a parent`);
      if (!parentAllowed(i.type, parent.type)) throw new Error(`${i.type} cannot attach to ${parent.type}`);
      const ps = await this.store.getEntityState(parent.id);
      if (!ps) throw new Error(`parent ${parent.id} not found`);
      if (ps.type !== parent.type) throw new Error(`parent ${parent.id} is a ${ps.type}, not ${parent.type}`);
      if (ps.isDeleted) throw new Error(`parent ${parent.id} is deleted`);
      if (i.type === "comment") {
        const depth = await this.newCommentDepth(parent);
        if (depth > COMMENT_MAX_DEPTH) throw new Error(`comment nesting exceeds max depth ${COMMENT_MAX_DEPTH}`);
      }
      if (i.type === "reaction") {
        const kind = (i.content as { kind?: ReactionKind } | undefined)?.kind;
        if (!kind || !REACTION_KINDS.includes(kind)) {
          throw new Error(`reaction kind must be one of: ${REACTION_KINDS.join(", ")}`);
        }
      }
      const rev = await this.store.getCurrentRevision(parent.id);
      if (rev) {
        parentRevisionHash = rev.hash;
        parentRevisionTxId = rev.txId;
      }
      rootEntityId = await this.resolveRoot(parent);
    }
    return { parentRevisionHash, parentRevisionTxId, rootEntityId, isSingleton: SINGLETON_PER_AUTHOR_PARENT.includes(i.type) };
  }

  /** Walk the parent chain to the root ancestor's entityId (the thread/signing-key scope). */
  private async resolveRoot(parent: ParentRef): Promise<string> {
    let curId = parent.id;
    let cur = await this.store.getEntityState(curId);
    while (cur && !isRootType(cur.type) && cur.parentId) {
      curId = cur.parentId;
      cur = await this.store.getEntityState(curId);
    }
    return curId;
  }

  /** The root ancestor entityId for an entity given its head (itself if a root type). */
  private async rootOf(head: StoredTx): Promise<string> {
    if (isRootType(head.type) || !head.parentType || !head.parentId) return head.entityId;
    return this.resolveRoot({ type: head.parentType, id: head.parentId });
  }

  /** Validate an UPDATE against the entity's head (shared by the unsigned + signed paths). `actor`
   *  is the claimed author (unsigned) or the signed `authorPubkey` (signed, where the signature
   *  PROVES control). Throws on any rule violation; returns the head + the root entity. */
  private async validateUpdate(entityId: string, actor: string): Promise<{ head: StoredTx; rootEntityId: string }> {
    const head = await this.store.getHeadTx(entityId);
    if (!head) throw new Error(`entity ${entityId} not found`);
    if (head.op === "delete") throw new Error(`entity ${entityId} is deleted`);
    if (!opAllowed(head.type, "update")) throw new Error(`update not allowed for ${head.type}`);
    this.assertAuthor(head.authorPubkey, actor, entityId);
    if (head.type === "vote") {
      if (!head.parentId) throw new Error("vote has no parent poll");
      if (!(await canChangeVote(this.store, head.parentId))) {
        throw new Error(`vote change not permitted for poll ${head.parentId} (rules/deadline)`);
      }
    }
    return { head, rootEntityId: await this.rootOf(head) };
  }

  /** Validate a DELETE against the entity's head (shared by the unsigned + signed paths). */
  private async validateDelete(entityId: string, actor: string): Promise<{ head: StoredTx; rootEntityId: string }> {
    const head = await this.store.getHeadTx(entityId);
    if (!head) throw new Error(`entity ${entityId} not found`);
    if (head.op === "delete") throw new Error(`entity ${entityId} already deleted`);
    if (!opAllowed(head.type, "delete")) throw new Error(`delete not allowed for ${head.type}`);
    this.assertAuthor(head.authorPubkey, actor, entityId);
    if (head.type === "petition_signature") {
      if (!head.parentId) throw new Error("signature has no parent petition");
      if (!(await canRevokeSignature(this.store, head.parentId))) {
        throw new Error(`signature revoke not permitted for petition ${head.parentId} (rules/deadline)`);
      }
    }
    return { head, rootEntityId: await this.rootOf(head) };
  }

  // ── Generic CRUD ──────────────────────────────────────────────────────────────────────

  async create(input: {
    type: RecordType;
    author: string;
    content: unknown;
    parent?: ParentRef;
    entityId?: string;
    createdAt?: string;
    signature?: string;
  }): Promise<Ref> {
    const { type, author } = input;
    const entityId = input.entityId ?? randomUUID();
    const r = await this.validateCreate({ type, author, content: input.content, parent: input.parent, entityId });

    // Unsigned dev path keeps the legacy per-author-pubkey singleton check (the signed path uses the
    // nullifier instead — see appendSigned).
    if (r.isSingleton && input.parent) {
      const existing = await this.store.getActiveSingleton(type, author, input.parent.id);
      if (existing) {
        throw new Error(`${author} already has an active ${type} on ${input.parent.id}; update it instead`);
      }
    }

    return this.append({
      type,
      entityId,
      op: "create",
      author,
      parent: input.parent,
      parentRevisionHash: r.parentRevisionHash,
      parentRevisionTxId: r.parentRevisionTxId,
      prevHash: null,
      content: input.content,
      createdAt: input.createdAt,
      signature: input.signature,
    });
  }

  async update(input: {
    entityId: string;
    author: string;
    content: unknown;
    createdAt?: string;
    signature?: string;
  }): Promise<Ref> {
    const { head } = await this.validateUpdate(input.entityId, input.author);
    return this.append({
      type: head.type,
      entityId: input.entityId,
      op: "update",
      author: input.author,
      parent: head.parentType && head.parentId ? { type: head.parentType, id: head.parentId } : undefined,
      parentRevisionHash: head.parentRevisionHash ?? undefined,
      parentRevisionTxId: head.parentRevisionTxId ?? undefined,
      prevHash: head.txHash,
      content: input.content,
      createdAt: input.createdAt,
      signature: input.signature,
    });
  }

  async delete(input: {
    entityId: string;
    author: string;
    createdAt?: string;
    signature?: string;
  }): Promise<Ref> {
    const { head } = await this.validateDelete(input.entityId, input.author);
    return this.append({
      type: head.type,
      entityId: input.entityId,
      op: "delete",
      author: input.author,
      parent: head.parentType && head.parentId ? { type: head.parentType, id: head.parentId } : undefined,
      parentRevisionHash: head.parentRevisionHash ?? undefined,
      parentRevisionTxId: head.parentRevisionTxId ?? undefined,
      prevHash: head.txHash,
      content: DELETE_MARKER,
      createdAt: input.createdAt,
      signature: input.signature,
    });
  }

  // ── Semantic helpers ──────────────────────────────────────────────────────────────────

  /** Add or change a reaction. Mutually exclusive: an existing active reaction is updated. */
  async react(author: string, parent: ParentRef, kind: ReactionKind): Promise<Ref> {
    const existing = await this.store.getActiveSingleton("reaction", author, parent.id);
    if (existing) return this.update({ entityId: existing.entityId, author, content: { kind } });
    return this.create({ type: "reaction", author, content: { kind }, parent });
  }

  /** Cast a vote on a poll (one per author; final unless the poll's rules allow change). */
  async vote(author: string, pollId: string, option: string): Promise<Ref> {
    return this.create({ type: "vote", author, content: { option }, parent: { type: "poll", id: pollId } });
  }

  /** Change an existing vote (gated by the poll's rules + deadline). */
  async changeVote(author: string, pollId: string, option: string): Promise<Ref> {
    const existing = await this.store.getActiveSingleton("vote", author, pollId);
    if (!existing) throw new Error(`${author} has no vote on poll ${pollId}`);
    return this.update({ entityId: existing.entityId, author, content: { option } });
  }

  /** Sign a petition (one per author; final unless the petition's rules allow revocation). */
  async sign(author: string, petitionId: string, comment?: string): Promise<Ref> {
    return this.create({
      type: "petition_signature",
      author,
      content: comment ? { comment } : {},
      parent: { type: "petition", id: petitionId },
    });
  }

  /** Revoke a signature (gated by the petition's rules + deadline). */
  async revoke(author: string, petitionId: string): Promise<Ref> {
    const existing = await this.store.getActiveSingleton("petition_signature", author, petitionId);
    if (!existing) throw new Error(`${author} has no active signature on petition ${petitionId}`);
    return this.delete({ entityId: existing.entityId, author });
  }

  /** Platform-signed governance: update an entity's rules (full-snapshot merge). */
  async updateRules(parentEntityId: string, rules: EntityRules, author: string = PLATFORM_PUBKEY): Promise<Ref> {
    const state = await this.store.getEntityState(parentEntityId);
    if (!state) throw new Error(`entity ${parentEntityId} not found`);
    const base = (state.content && typeof state.content === "object" ? state.content : {}) as Record<string, unknown>;
    return this.update({ entityId: parentEntityId, author, content: { ...base, rules } });
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────

  private assertAuthor(owner: string, actor: string, entityId: string): void {
    if (owner !== actor && actor !== PLATFORM_PUBKEY) {
      throw new Error(`only the author (or platform) may modify ${entityId}`);
    }
  }

  private async append(spec: AppendSpec): Promise<Ref> {
    const txId = randomUUID();
    const salt = newSalt();
    const createdAt = spec.createdAt ?? new Date().toISOString();
    const contentHash = contentCommitment({ id: txId, salt, content: spec.content });

    const envelope: TxEnvelope = {
      v: 1,
      txId,
      type: spec.type,
      entityId: spec.entityId,
      op: spec.op,
      ...(spec.parent ? { parentType: spec.parent.type, parentId: spec.parent.id } : {}),
      ...(spec.parentRevisionTxId ? { parentRevisionTxId: spec.parentRevisionTxId } : {}),
      ...(spec.parentRevisionHash ? { parentRevisionHash: spec.parentRevisionHash } : {}),
      authorPubkey: spec.author,
      signature: spec.signature ?? "unsigned",
      createdAt,
      prevHash: spec.prevHash,
      contentHash,
    };

    const { txHash } = await this.chain.append(envelope, { salt, content: spec.content });
    return { txId, entityId: spec.entityId, txHash };
  }

  /** The depth a NEW comment would occupy if attached to `parent` (1 = directly on a root). */
  private async newCommentDepth(parent: ParentRef): Promise<number> {
    let depth = 1;
    let cur: { type: RecordType | null; id: string | null } = parent;
    while (cur.type === "comment" && cur.id) {
      depth += 1;
      const ps = await this.store.getEntityState(cur.id);
      if (!ps) throw new Error(`parent comment ${cur.id} not found`);
      cur = { type: ps.parentType, id: ps.parentId };
    }
    return depth;
  }
}
