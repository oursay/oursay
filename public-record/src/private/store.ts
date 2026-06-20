import { randomUUID } from "node:crypto";
import pg from "pg";
import type { PgConfig } from "../config.js";
import type { ChainRow } from "../ledger/connector.js";
import { POSTGRES_DDL } from "../schema/postgres.sql.js";
import type { Op, RecordType } from "../schema/types.js";

/** A private per-thread registration binding row (never published). */
export interface ThreadBindingRow {
  threadPubkey: string;
  threadId: string;
  level: string;
  kycTier: string;
  region: string | null;
  commitment: string;
  bindingSig: string;
}

/** A full event-log row (the private, mutable record of one transaction). */
export interface StoredTx {
  txId: string;
  seq: number;
  type: RecordType;
  entityId: string;
  op: Op;
  parentType: RecordType | null;
  parentId: string | null;
  parentRevisionTxId: string | null;
  parentRevisionHash: string | null;
  authorPubkey: string;
  signature: string;
  createdAt: string;
  prevHash: string | null;
  contentHash: string;
  nullifier: string | null;
  txHash: string;
  envelope: string;
  salt: string | null;
  content: unknown;
  redactedAt: string | null;
  erasedAt: string | null;
}

/** What `appendTx` needs: the envelope fields + the raw (erasable) content + salt. */
export interface AppendTxInput {
  txId: string;
  type: RecordType;
  entityId: string;
  op: Op;
  parentType?: RecordType;
  parentId?: string;
  parentRevisionTxId?: string;
  parentRevisionHash?: string;
  authorPubkey: string;
  signature: string;
  createdAt: string;
  prevHash: string | null;
  contentHash: string;
  nullifier?: string;
  txHash: string;
  envelope: string;
  salt: string;
  content: unknown;
}

/** The current folded state of an entity (latest transaction wins). */
export interface EntityState {
  entityId: string;
  type: RecordType;
  latestOp: Op;
  content: unknown;
  contentHash: string;
  authorPubkey: string;
  nullifier: string | null;
  parentType: RecordType | null;
  parentId: string | null;
  parentRevisionHash: string | null;
  headTxId: string;
  headTxHash: string;
  isDeleted: boolean;
  isRedacted: boolean;
  isErased: boolean;
}

/**
 * The PUBLIC, response-safe view of an entity: content is WITHHELD (null) when the entity is
 * redacted or erased — the commitment (`contentHash`) stands in. Redaction keeps the raw
 * content in this store (retained for lawful access) but the platform never serves it; erasure
 * destroys it. Build every public response from this, not from the internal `EntityState`.
 */
export interface PublicEntityView {
  entityId: string;
  type: RecordType;
  latestOp: Op;
  contentHash: string;
  content: unknown | null; // null when withheld
  withheld: boolean; // true if redacted or erased
  isDeleted: boolean;
  isRedacted: boolean;
  isErased: boolean;
}

export function toPublicView(s: EntityState): PublicEntityView {
  const withheld = s.isRedacted || s.isErased;
  return {
    entityId: s.entityId,
    type: s.type,
    latestOp: s.latestOp,
    contentHash: s.contentHash,
    content: withheld ? null : s.content,
    withheld,
    isDeleted: s.isDeleted,
    isRedacted: s.isRedacted,
    isErased: s.isErased,
  };
}

export interface ReactionCount {
  kind: string;
  count: number;
}

/**
 * The PRIVATE, mutable store: the `record_tx` event log holding raw content + salt (erasable),
 * identity stubs, and the fold-on-read projection views. immudb holds only commitments; this
 * holds the data whose integrity those commitments protect.
 */
export class PrivateStore {
  private pool: pg.Pool;

  constructor(cfg: PgConfig) {
    this.pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      max: 4,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(POSTGRES_DDL);
  }

  /** Wipe all rows (test isolation). immudb is append-only and is never reset. */
  async reset(): Promise<void> {
    await this.pool.query(
      "TRUNCATE record_outbox, record_tx, thread_signers, device_keys, thread_bindings, nullifier_attestations, thread_keys, level_master_keys, kyc_attestations, users CASCADE",
    );
  }

  /**
   * Append the private record AND enqueue its commitment for the chain in ONE Postgres transaction.
   * Either both rows land or neither does — so a crash can never leave a record_tx orphaned
   * without a pending outbox row to settle it (see BlockSettler). The outbox `payload` is the exact
   * ChainRow (commitments only — never plaintext/salt); `chainId` tags which chain it settles to.
   */
  async appendTxAndEnqueue(input: AppendTxInput, chainRow: ChainRow, chainId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO record_tx
          (tx_id, type, entity_id, op, parent_type, parent_id, parent_revision_tx_id,
           parent_revision_hash, author_pubkey, signature, created_at, prev_hash, content_hash,
           nullifier, tx_hash, envelope, salt, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          input.txId,
          input.type,
          input.entityId,
          input.op,
          input.parentType ?? null,
          input.parentId ?? null,
          input.parentRevisionTxId ?? null,
          input.parentRevisionHash ?? null,
          input.authorPubkey,
          input.signature,
          input.createdAt,
          input.prevHash,
          input.contentHash,
          input.nullifier ?? null,
          input.txHash,
          input.envelope,
          input.salt,
          JSON.stringify(input.content),
        ],
      );
      await client.query(
        `INSERT INTO record_outbox (tx_id, chain_id, payload) VALUES ($1, $2, $3)`,
        [input.txId, chainId, JSON.stringify(chainRow)],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Settlement pool (block-close trigger) ───────────────────────────────────────────────

  /**
   * Pool stats for the settlement trigger, scoped to ONE chain: how many of its txs are unsettled,
   * and when the OLDEST was ingested. `enqueued_at` is a server-side ingestion clock (atomic with
   * the write), used ONLY as an operational cadence signal — never as an ordering authority (doc 07
   * §3.2). `oldestEnqueuedAt` is null when the chain's pool is empty.
   */
  async getPendingPoolStats(chainId: string): Promise<{ count: number; oldestEnqueuedAt: string | null }> {
    const r = await this.pool.query(
      `SELECT COUNT(*)::int AS count, MIN(enqueued_at) AS oldest
       FROM record_outbox WHERE status = 'pending' AND chain_id = $1`,
      [chainId],
    );
    const row = r.rows[0];
    return {
      count: Number(row.count),
      oldestEnqueuedAt: row.oldest ? new Date(row.oldest).toISOString() : null,
    };
  }

  /**
   * The next pending commitments to settle for ONE chain, oldest `seq` first (so a block always
   * covers a contiguous prefix of that chain's unsettled stream). A settler drains only its own
   * `chainId`, so a shared Postgres pool can carry several chains without one sweeping another's.
   * Returns the global `seq` (the block's upper bound) and the exact `ChainRow` payload.
   */
  async getPendingForSettlement(
    chainId: string,
    limit: number,
  ): Promise<{ txId: string; seq: number; payload: ChainRow }[]> {
    const r = await this.pool.query(
      `SELECT o.tx_id, t.seq, o.payload
       FROM record_outbox o JOIN record_tx t ON t.tx_id = o.tx_id
       WHERE o.status = 'pending' AND o.chain_id = $1 ORDER BY t.seq ASC LIMIT $2`,
      [chainId, limit],
    );
    return r.rows.map((row) => ({ txId: row.tx_id, seq: Number(row.seq), payload: row.payload as ChainRow }));
  }

  /** Mark a whole settled block's commitments sent in one statement (atomic with respect to readers). */
  async markOutboxSentBatch(txIds: string[]): Promise<void> {
    if (txIds.length === 0) return;
    await this.pool.query(
      `UPDATE record_outbox SET status = 'sent', sent_at = now() WHERE tx_id = ANY($1::uuid[])`,
      [txIds],
    );
  }

  /** Record a failed relay attempt; the row stays pending for the next sweep. */
  async markOutboxFailed(txId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE record_outbox SET attempts = attempts + 1, last_error = $2 WHERE tx_id = $1`,
      [txId, error],
    );
  }

  /** The entity's current head transaction (for the per-entity prevHash link). */
  async getEntityHead(
    entityId: string,
  ): Promise<{ txHash: string; op: Op; type: RecordType; authorPubkey: string } | undefined> {
    const r = await this.pool.query(
      `SELECT tx_hash, op, type, author_pubkey FROM record_tx
       WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
      [entityId],
    );
    if (r.rows.length === 0) return undefined;
    const row = r.rows[0];
    return { txHash: row.tx_hash, op: row.op, type: row.type, authorPubkey: row.author_pubkey };
  }

  /** The entity's full latest transaction row (for carry-forward of parent fields on update/delete). */
  async getHeadTx(entityId: string): Promise<StoredTx | undefined> {
    const r = await this.pool.query(
      `SELECT * FROM record_tx WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1`,
      [entityId],
    );
    return r.rows.length === 0 ? undefined : mapStoredTx(r.rows[0]);
  }

  /** The latest non-deleted content revision (create/update) of an entity: its hash + tx id. */
  async getCurrentRevision(entityId: string): Promise<{ hash: string; txId: string } | undefined> {
    const r = await this.pool.query(
      `SELECT revision_hash, revision_tx_id FROM entity_current_revision WHERE entity_id = $1`,
      [entityId],
    );
    if (r.rows.length === 0) return undefined;
    return { hash: r.rows[0].revision_hash, txId: r.rows[0].revision_tx_id };
  }

  /** The entity's current folded state (INTERNAL — includes retained-but-redacted content). */
  async getEntityState(entityId: string): Promise<EntityState | undefined> {
    const r = await this.pool.query(`SELECT * FROM entity_state WHERE entity_id = $1`, [entityId]);
    if (r.rows.length === 0) return undefined;
    return mapEntityState(r.rows[0]);
  }

  /** The PUBLIC, response-safe state: content withheld when redacted/erased (the hash stands in). */
  async getEntityStatePublic(entityId: string): Promise<PublicEntityView | undefined> {
    const s = await this.getEntityState(entityId);
    return s ? toPublicView(s) : undefined;
  }

  /** The hash of the latest non-deleted content revision (create/update) of an entity. */
  async getCurrentRevisionHash(entityId: string): Promise<string | undefined> {
    const r = await this.pool.query(
      `SELECT revision_hash FROM entity_current_revision WHERE entity_id = $1`,
      [entityId],
    );
    return r.rows.length === 0 ? undefined : (r.rows[0].revision_hash as string);
  }

  /** Full transaction history of an entity, oldest → newest (for chain verification). */
  async getEntityHistory(entityId: string): Promise<StoredTx[]> {
    const r = await this.pool.query(
      `SELECT * FROM record_tx WHERE entity_id = $1 ORDER BY seq ASC`,
      [entityId],
    );
    return r.rows.map(mapStoredTx);
  }

  /** The highest seq currently in the log (0 if empty) — the upper bound for a block close. */
  async getMaxSeq(): Promise<number> {
    const r = await this.pool.query(`SELECT COALESCE(max(seq), 0) AS max FROM record_tx`);
    return Number(r.rows[0].max);
  }

  /** Transactions in the seq range `(fromExclusive, toInclusive]`, ordered by seq — one block. */
  async getTxsBySeqRange(fromExclusive: number, toInclusive: number): Promise<StoredTx[]> {
    const r = await this.pool.query(
      `SELECT * FROM record_tx WHERE seq > $1 AND seq <= $2 ORDER BY seq ASC`,
      [fromExclusive, toInclusive],
    );
    return r.rows.map(mapStoredTx);
  }

  /**
   * The active "singleton" entity (reaction / vote / petition_signature) by this author on
   * this parent, if any — used to enforce one-per-author-per-parent and to locate the entity
   * to update/revoke. Returns the entity_id + its head, or undefined.
   */
  async getActiveSingleton(
    type: RecordType,
    authorPubkey: string,
    parentId: string,
  ): Promise<{ entityId: string; headTxHash: string } | undefined> {
    const r = await this.pool.query(
      `SELECT entity_id, head_tx_hash FROM entity_state
       WHERE type = $1 AND author_pubkey = $2 AND parent_id = $3 AND NOT is_deleted`,
      [type, authorPubkey, parentId],
    );
    if (r.rows.length === 0) return undefined;
    return { entityId: r.rows[0].entity_id, headTxHash: r.rows[0].head_tx_hash };
  }

  async getReactionCountsByEntity(parentId: string): Promise<ReactionCount[]> {
    const r = await this.pool.query(
      `SELECT kind, count FROM reaction_counts_by_entity WHERE parent_id = $1`,
      [parentId],
    );
    return r.rows.map((x) => ({ kind: x.kind, count: Number(x.count) }));
  }

  async getReactionCountsByRevision(revisionHash: string): Promise<ReactionCount[]> {
    const r = await this.pool.query(
      `SELECT kind, count FROM reaction_counts_by_revision WHERE parent_revision_hash = $1`,
      [revisionHash],
    );
    return r.rows.map((x) => ({ kind: x.kind, count: Number(x.count) }));
  }

  async getPetitionSignatureCount(petitionId: string): Promise<number> {
    const r = await this.pool.query(
      `SELECT count FROM petition_signature_counts WHERE petition_id = $1`,
      [petitionId],
    );
    return r.rows.length === 0 ? 0 : Number(r.rows[0].count);
  }

  async getPollResults(pollId: string): Promise<{ option: string; count: number }[]> {
    const r = await this.pool.query(
      `SELECT option, count FROM poll_results WHERE poll_id = $1 ORDER BY option`,
      [pollId],
    );
    return r.rows.map((x) => ({ option: x.option, count: Number(x.count) }));
  }

  /** Comments attached to a parent entity (entity-pinned), oldest → newest. */
  async getChildComments(parentId: string): Promise<EntityState[]> {
    const r = await this.pool.query(
      `SELECT es.* FROM entity_state es
       WHERE es.type = 'comment' AND es.parent_id = $1
       ORDER BY es.created_at ASC`,
      [parentId],
    );
    return r.rows.map(mapEntityState);
  }

  /** REDACTION: withhold plaintext from any public export, but RETAIN it privately. */
  async redact(txId: string): Promise<void> {
    await this.pool.query(
      `UPDATE record_tx SET redacted_at = now() WHERE tx_id = $1 AND redacted_at IS NULL`,
      [txId],
    );
  }

  /** TRUE ERASURE: physically destroy the plaintext + salt; the hash chain still verifies. */
  async erase(txId: string): Promise<void> {
    await this.pool.query(
      `UPDATE record_tx SET content = NULL, salt = NULL, erased_at = now() WHERE tx_id = $1`,
      [txId],
    );
  }

  async putUser(u: { id: string; handle?: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO users(id, handle) VALUES($1,$2) ON CONFLICT (id) DO UPDATE SET handle = EXCLUDED.handle`,
      [u.id, u.handle ?? null],
    );
  }

  /** Record a user's PUBLIC level master key (root for on-device per-thread derivation). */
  async putLevelMaster(m: { userId: string; level: string; masterPubkey: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO level_master_keys(user_id, level, master_pubkey) VALUES($1,$2,$3)
       ON CONFLICT (user_id, level) DO UPDATE SET master_pubkey = EXCLUDED.master_pubkey`,
      [m.userId, m.level, m.masterPubkey],
    );
  }

  /**
   * Register a per-thread key and its private platform binding in ONE transaction (verified-tier
   * pre-registration). The binding carries the opaque commitment + the platform's signature; it is
   * never published. Upserts so a re-registration of the same thread key is idempotent.
   */
  async registerThreadBinding(input: {
    threadPubkey: string;
    userId: string;
    threadId: string;
    level: string;
    kycTier: string;
    region?: string | null;
    commitment: string;
    bindingSig: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO thread_keys(id, user_id, thread_id, level, pubkey) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (pubkey) DO UPDATE SET user_id = EXCLUDED.user_id, thread_id = EXCLUDED.thread_id, level = EXCLUDED.level`,
        [randomUUID(), input.userId, input.threadId, input.level, input.threadPubkey],
      );
      await client.query(
        `INSERT INTO thread_bindings(thread_pubkey, thread_id, level, kyc_tier, region, commitment, binding_sig)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (thread_pubkey) DO UPDATE SET
           thread_id = EXCLUDED.thread_id, level = EXCLUDED.level, kyc_tier = EXCLUDED.kyc_tier,
           region = EXCLUDED.region, commitment = EXCLUDED.commitment, binding_sig = EXCLUDED.binding_sig`,
        [input.threadPubkey, input.threadId, input.level, input.kycTier, input.region ?? null, input.commitment, input.bindingSig],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** The private binding for a thread key, or null if the key is not registered. */
  async getThreadBinding(threadPubkey: string): Promise<ThreadBindingRow | null> {
    const r = await this.pool.query(
      `SELECT thread_pubkey, thread_id, level, kyc_tier, region, commitment, binding_sig
       FROM thread_bindings WHERE thread_pubkey = $1`,
      [threadPubkey],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      threadPubkey: row.thread_pubkey,
      threadId: row.thread_id,
      level: row.level,
      kycTier: row.kyc_tier,
      region: row.region ?? null,
      commitment: row.commitment,
      bindingSig: row.binding_sig,
    };
  }

  /** Resolve a thread key to its `(user, thread=root, level)` — the thread-scope lookup. */
  async getThreadKey(pubkey: string): Promise<{ userId: string; threadId: string; level: string } | null> {
    const r = await this.pool.query(
      `SELECT user_id, thread_id, level FROM thread_keys WHERE pubkey = $1`,
      [pubkey],
    );
    const row = r.rows[0];
    return row ? { userId: row.user_id, threadId: row.thread_id, level: row.level } : null;
  }

  // ── Multi-device enrollment (Method 3 §5.4) — all PRIVATE, never published ────────────────

  /**
   * Enrol a hardware-backed PUBLIC device key for a user (multi-passkey / multi-device). Idempotent
   * on `device_pubkey` (re-enroll clears any prior revocation). Returns the device row id, which a
   * thread-scoped signer references. `device_pubkey` is account-level and NEVER goes on an envelope.
   */
  async enrollDeviceKey(input: { userId: string; devicePubkey: string; label?: string | null }): Promise<string> {
    const id = randomUUID();
    const r = await this.pool.query(
      `INSERT INTO device_keys(id, user_id, device_pubkey, label) VALUES($1,$2,$3,$4)
       ON CONFLICT (device_pubkey) DO UPDATE SET user_id = EXCLUDED.user_id, label = EXCLUDED.label, revoked_at = NULL
       RETURNING id`,
      [id, input.userId, input.devicePubkey, input.label ?? null],
    );
    return r.rows[0].id as string;
  }

  /** Revoke an enrolled device (lost/retired). Its thread-scoped signers stop being usable. */
  async revokeDeviceKey(devicePubkey: string): Promise<void> {
    await this.pool.query(
      `UPDATE device_keys SET revoked_at = now() WHERE device_pubkey = $1 AND revoked_at IS NULL`,
      [devicePubkey],
    );
  }

  /**
   * Register a thread-scoped device signer: the PUBLISHED `signer_pubkey` (the envelope's
   * signerPubkey) mapped privately to its device and verified user for one thread. Upsert keeps it
   * idempotent and clears any prior revocation.
   */
  async registerThreadSigner(input: {
    signerPubkey: string;
    userId: string;
    deviceId: string;
    threadId: string;
    level: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO thread_signers(signer_pubkey, user_id, device_id, thread_id, level) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (signer_pubkey) DO UPDATE SET
         user_id = EXCLUDED.user_id, device_id = EXCLUDED.device_id,
         thread_id = EXCLUDED.thread_id, level = EXCLUDED.level, revoked_at = NULL`,
      [input.signerPubkey, input.userId, input.deviceId, input.threadId, input.level],
    );
  }

  /** Revoke a single thread-scoped signer (without retiring the whole device). */
  async revokeThreadSigner(signerPubkey: string): Promise<void> {
    await this.pool.query(
      `UPDATE thread_signers SET revoked_at = now() WHERE signer_pubkey = $1 AND revoked_at IS NULL`,
      [signerPubkey],
    );
  }

  /**
   * Resolve a published thread-scoped signer to its `(user, thread)` for the appendSigned
   * authorization check. `revoked` is true when either the signer OR its enrolling device is revoked
   * (a lost device disables all its signers). Returns null when the signer is unknown.
   */
  async getThreadSigner(
    signerPubkey: string,
  ): Promise<{ userId: string; threadId: string; deviceId: string; revoked: boolean } | null> {
    const r = await this.pool.query(
      `SELECT s.user_id, s.thread_id, s.device_id,
              (s.revoked_at IS NOT NULL OR d.revoked_at IS NOT NULL) AS revoked
       FROM thread_signers s JOIN device_keys d ON d.id = s.device_id
       WHERE s.signer_pubkey = $1`,
      [signerPubkey],
    );
    const row = r.rows[0];
    return row
      ? { userId: row.user_id, threadId: row.thread_id, deviceId: row.device_id, revoked: row.revoked }
      : null;
  }

  /** The platform-attested nullifier for `(user, parent)`, or null if none has been attested yet. */
  async getAttestedNullifier(userId: string, parentId: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT nullifier FROM nullifier_attestations WHERE user_id = $1 AND parent_id = $2`,
      [userId, parentId],
    );
    return r.rows[0]?.nullifier ?? null;
  }

  /**
   * Record the platform's attestation that `nullifier` is this verified user's single nullifier for
   * `parentId`. Idempotent per `(user, parent)` (a re-attest keeps the first). Throws if that
   * nullifier value is already attested for a DIFFERENT user on this parent
   * (UNIQUE(parent_id, nullifier) collision — someone replayed another user's nullifier).
   */
  async attestNullifier(input: { userId: string; parentId: string; nullifier: string; platformSig: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO nullifier_attestations(user_id, parent_id, nullifier, platform_sig) VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id, parent_id) DO NOTHING`,
      [input.userId, input.parentId, input.nullifier, input.platformSig],
    );
  }

  /** True if an ACTIVE singleton on `parentId` already bears `nullifier` (the per-parent dedupe). */
  async hasActiveSingletonByNullifier(parentId: string, nullifier: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM entity_state WHERE parent_id = $1 AND nullifier = $2 AND NOT is_deleted LIMIT 1`,
      [parentId, nullifier],
    );
    return r.rows.length > 0;
  }

  /** KYC attestation stub — carries the tier; no provider integration this phase. */
  async putAttestation(a: { userId: string; provider: string; tier: string; region?: string | null }): Promise<void> {
    await this.pool.query(
      `INSERT INTO kyc_attestations(id, user_id, provider, tier, region) VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(), a.userId, a.provider, a.tier, a.region ?? null],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function mapEntityState(row: pg.QueryResultRow): EntityState {
  return {
    entityId: row.entity_id,
    type: row.type,
    latestOp: row.latest_op,
    content: row.content,
    contentHash: row.content_hash,
    authorPubkey: row.author_pubkey,
    nullifier: row.nullifier ?? null,
    parentType: row.parent_type,
    parentId: row.parent_id,
    parentRevisionHash: row.parent_revision_hash,
    headTxId: row.head_tx_id,
    headTxHash: row.head_tx_hash,
    isDeleted: row.is_deleted,
    isRedacted: row.is_redacted,
    isErased: row.is_erased,
  };
}

function mapStoredTx(row: pg.QueryResultRow): StoredTx {
  return {
    txId: row.tx_id,
    seq: Number(row.seq),
    type: row.type,
    entityId: row.entity_id,
    op: row.op,
    parentType: row.parent_type,
    parentId: row.parent_id,
    parentRevisionTxId: row.parent_revision_tx_id,
    parentRevisionHash: row.parent_revision_hash,
    authorPubkey: row.author_pubkey,
    signature: row.signature,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString(),
    prevHash: row.prev_hash,
    contentHash: row.content_hash,
    nullifier: row.nullifier ?? null,
    txHash: row.tx_hash,
    envelope: row.envelope,
    salt: row.salt,
    content: row.content,
    redactedAt: row.redacted_at ? new Date(row.redacted_at).toISOString() : null,
    erasedAt: row.erased_at ? new Date(row.erased_at).toISOString() : null,
  };
}
