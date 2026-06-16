import { randomUUID } from "node:crypto";
import { contentCommitment, newSalt } from "./crypto/commitment.js";
import { canRevokeSignature, canChangeVote } from "./governance.js";
import type { PublicChain } from "./ledger/chain.js";
import type { PrivateStore } from "./private/store.js";
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
  constructor(
    private readonly chain: PublicChain,
    private readonly store: PrivateStore,
  ) {}

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
    if (!opAllowed(type, "create")) throw new Error(`create not allowed for ${type}`);

    let parentRevisionHash: string | undefined;
    let parentRevisionTxId: string | undefined;

    if (isRootType(type)) {
      if (input.parent) throw new Error(`${type} is a root type and takes no parent`);
    } else {
      const parent = input.parent;
      if (!parent) throw new Error(`${type} requires a parent`);
      if (!parentAllowed(type, parent.type)) {
        throw new Error(`${type} cannot attach to ${parent.type}`);
      }
      const ps = await this.store.getEntityState(parent.id);
      if (!ps) throw new Error(`parent ${parent.id} not found`);
      if (ps.type !== parent.type) {
        throw new Error(`parent ${parent.id} is a ${ps.type}, not ${parent.type}`);
      }
      if (ps.isDeleted) throw new Error(`parent ${parent.id} is deleted`);

      if (type === "comment") {
        const depth = await this.newCommentDepth(parent);
        if (depth > COMMENT_MAX_DEPTH) {
          throw new Error(`comment nesting exceeds max depth ${COMMENT_MAX_DEPTH}`);
        }
      }
      if (type === "reaction") {
        const kind = (input.content as { kind?: ReactionKind } | undefined)?.kind;
        if (!kind || !REACTION_KINDS.includes(kind)) {
          throw new Error(`reaction kind must be one of: ${REACTION_KINDS.join(", ")}`);
        }
      }
      if (SINGLETON_PER_AUTHOR_PARENT.includes(type)) {
        const existing = await this.store.getActiveSingleton(type, author, parent.id);
        if (existing) {
          throw new Error(`${author} already has an active ${type} on ${parent.id}; update it instead`);
        }
      }

      // Capture the parent's CURRENT revision so support stays pinned to the content it endorsed.
      const rev = await this.store.getCurrentRevision(parent.id);
      if (rev) {
        parentRevisionHash = rev.hash;
        parentRevisionTxId = rev.txId;
      }
    }

    return this.append({
      type,
      entityId: input.entityId ?? randomUUID(),
      op: "create",
      author,
      parent: input.parent,
      parentRevisionHash,
      parentRevisionTxId,
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
    const head = await this.store.getHeadTx(input.entityId);
    if (!head) throw new Error(`entity ${input.entityId} not found`);
    if (head.op === "delete") throw new Error(`entity ${input.entityId} is deleted`);
    if (!opAllowed(head.type, "update")) throw new Error(`update not allowed for ${head.type}`);
    this.assertAuthor(head.authorPubkey, input.author, input.entityId);

    if (head.type === "vote") {
      if (!head.parentId) throw new Error("vote has no parent poll");
      if (!(await canChangeVote(this.store, head.parentId))) {
        throw new Error(`vote change not permitted for poll ${head.parentId} (rules/deadline)`);
      }
    }

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
    const head = await this.store.getHeadTx(input.entityId);
    if (!head) throw new Error(`entity ${input.entityId} not found`);
    if (head.op === "delete") throw new Error(`entity ${input.entityId} already deleted`);
    if (!opAllowed(head.type, "delete")) throw new Error(`delete not allowed for ${head.type}`);
    this.assertAuthor(head.authorPubkey, input.author, input.entityId);

    if (head.type === "petition_signature") {
      if (!head.parentId) throw new Error("signature has no parent petition");
      if (!(await canRevokeSignature(this.store, head.parentId))) {
        throw new Error(`signature revoke not permitted for petition ${head.parentId} (rules/deadline)`);
      }
    }

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
