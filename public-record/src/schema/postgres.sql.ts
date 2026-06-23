// DDL for the PRIVATE, mutable Postgres store: the event log (record_tx) holding raw content
// + salt (erasable), minimal identity stubs, and fold-on-read projection views.
//
// This is real Postgres (not immudb pg-wire), so full SQL/DDL is available.

export const POSTGRES_DDL = `
-- The append-only event log, with the raw content behind each commitment. Mutable so that
-- redaction (withhold) and erasure (destroy plaintext) are physically possible.
CREATE TABLE IF NOT EXISTS record_tx (
  tx_id                 UUID PRIMARY KEY,
  seq                   BIGSERIAL,                 -- global insertion order; latest = max(seq)
  type                  TEXT NOT NULL,
  entity_id             UUID NOT NULL,             -- stable across the entity's lifecycle
  op                    TEXT NOT NULL CHECK (op IN ('create','update','delete')),
  parent_type           TEXT,
  parent_id             UUID,
  parent_revision_tx_id UUID,                      -- the parent's head tx at attach time
  parent_revision_hash  TEXT,                      -- the parent's content-addressed revision (txHash)
  author_pubkey         TEXT NOT NULL,
  signature             TEXT NOT NULL,             -- stub for now
  created_at            TIMESTAMPTZ NOT NULL,      -- the envelope's createdAt (part of the hash)
  prev_hash             TEXT,                      -- per-entity chain link
  content_hash          TEXT NOT NULL,
  nullifier             TEXT,                      -- singleton dedupe tag (vote/signature/reaction); NULL otherwise
  tx_hash               TEXT NOT NULL,             -- hash of the canonical envelope (this revision's id)
  envelope              TEXT NOT NULL,             -- exact canonical JSON envelope (byte-exact; feeds tx_hash)
  salt                  TEXT,                      -- hex; NULL after erasure
  content               JSONB,                     -- NULL after erasure
  redacted_at           TIMESTAMPTZ,
  erased_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS record_tx_entity_seq ON record_tx (entity_id, seq);
CREATE INDEX IF NOT EXISTS record_tx_parent     ON record_tx (parent_id);
CREATE INDEX IF NOT EXISTS record_tx_parent_rev ON record_tx (parent_revision_hash);
CREATE INDEX IF NOT EXISTS record_tx_type       ON record_tx (type);
-- Idempotent migration for a persistent dev DB created before the nullifier column existed.
ALTER TABLE record_tx ADD COLUMN IF NOT EXISTS nullifier TEXT;

-- Settlement pool / transactional outbox. Each record_tx insert atomically enqueues its commitment
-- here (same Postgres transaction) as 'pending', so a crash before settlement can never orphan a
-- record: the pending row is settled to immudb idempotently by BlockSettler (which batches pending
-- rows into a block). enqueued_at is the ingestion clock the settlement age-trigger reads. The
-- payload is the exact ChainRow (commitments + canonical envelope ONLY — never plaintext/salt), so
-- settlement is self-contained and unaffected by later redaction/erasure of record_tx.
--
-- chain_id tags which chain a pooled tx settles to (set at append time, default the deployment's
-- CHAIN_ID). A BlockSettler drains ONLY its own chain_id, so one shared immudb can host several
-- chains and a settler can never sweep another chain's pending. (The fold-on-read views above stay
-- single-tenant: one Postgres = one body. Multi-tenant content views are out of scope.)
CREATE TABLE IF NOT EXISTS record_outbox (
  tx_id       UUID PRIMARY KEY REFERENCES record_tx(tx_id),
  chain_id    TEXT         NOT NULL DEFAULT 'oursay-global',
  payload     JSONB        NOT NULL,
  status      TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent')),
  attempts    INT          NOT NULL DEFAULT 0,
  last_error  TEXT,
  enqueued_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
-- Idempotent migration for a persistent dev DB created before chain_id existed.
ALTER TABLE record_outbox ADD COLUMN IF NOT EXISTS chain_id TEXT NOT NULL DEFAULT 'oursay-global';
CREATE INDEX IF NOT EXISTS record_outbox_pending ON record_outbox (chain_id, enqueued_at) WHERE status = 'pending';

-- Identity (verified-tier append path). Primitives promoted into public-record/src/identity/*.
-- NOTE: session/passkey_credential tables (auth milestone) and encrypted PII (email_enc, salt_t_enc;
-- KMS milestone) are intentionally NOT here yet — see the Track A plan's roadmap.
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY,
  handle       TEXT,                  -- optional, UNIQUE @username (public profile); no spaces. NULL until claimed.
  display_name TEXT,                  -- optional public display text; defaults to handle without its '@'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent migration for a persistent dev DB created before display_name existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
-- handle is unique when present (Postgres treats NULLs as distinct, so unclaimed accounts are fine).
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (handle);

-- Jurisdiction-scoped master PUBLIC keys: one per (user, jurisdiction); the root a client derives
-- per-thread keys from on-device (HKDF). The platform stores only the public master.
CREATE TABLE IF NOT EXISTS jurisdiction_master_keys (
  user_id       UUID NOT NULL REFERENCES users(id),
  jurisdiction  TEXT NOT NULL,
  master_pubkey TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jurisdiction)
);

-- thread_keys / thread_bindings / thread_signers are reshaped (level → jurisdiction; dropped
-- thread_bindings.region). They carry no durable production data yet, so DROP+CREATE keeps the
-- shape deterministic across a reused dev volume. level_master_keys was renamed to
-- jurisdiction_master_keys (created fresh above); drop the legacy table if it lingers.
DROP TABLE IF EXISTS thread_signers CASCADE;
DROP TABLE IF EXISTS thread_bindings CASCADE;
DROP TABLE IF EXISTS thread_keys CASCADE;
DROP TABLE IF EXISTS level_master_keys CASCADE;

-- Per-thread public keys. pubkey is the public author identity that appears in the envelope.
CREATE TABLE thread_keys (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  thread_id    TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  pubkey       TEXT NOT NULL UNIQUE,          -- compressed SEC1 P-256, hex
  claimed    BOOLEAN NOT NULL DEFAULT false,  -- user has publicly claimed this thread (R8; future)
  claimed_at TIMESTAMPTZ,                     -- nullable; claim may be undone (R9; future)
  UNIQUE (user_id, thread_id)
);
CREATE INDEX IF NOT EXISTS thread_keys_pubkey ON thread_keys (pubkey);

-- Private platform registration binding (NEVER published). Commits the thread key to one opaque
-- account commitment; the platform signs over the binding fields. salt_t escrow / at-rest encryption
-- is a later (KMS) milestone — salt_t stays client-held for now, so it is NOT stored here.
-- kyc_tier is OPTIONAL: a binding proves account↔thread-key OWNERSHIP; verification tier is applied
-- at read/count time, not fixed at join. NULL when ownership is bound without a tier.
CREATE TABLE IF NOT EXISTS thread_bindings (
  thread_pubkey TEXT PRIMARY KEY REFERENCES thread_keys(pubkey),
  thread_id     TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,
  kyc_tier      TEXT,                          -- nullable; omitted from the signed binding when absent
  commitment    TEXT NOT NULL,                -- opaque H(user_id, salt_t, thread_id, jurisdiction), hex
  binding_sig   TEXT NOT NULL,                -- platform P-256 signature over the binding, hex
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migration for deployments created before kyc_tier became optional (idempotent: a no-op once the
-- column is already nullable). Keeps init() self-migrating without a separate migration framework.
ALTER TABLE thread_bindings ALTER COLUMN kyc_tier DROP NOT NULL;

-- Multi-device enrollment (Identity & Device Policy §5.4, Method 3). PRIVATE — NEVER published.
-- One row per hardware-backed device key a user enrols (passkey / secure enclave); the platform
-- stores only the PUBLIC key. device_pubkey is the stable ACCOUNT-LEVEL key and must NEVER appear on
-- an envelope — putting a stable device id on the record across threads is Method 5 (§5.3, ruled
-- out). It is used only privately, to anchor the thread-scoped signers below. revoked_at marks a
-- lost/retired device; a revoked device may no longer sign.
CREATE TABLE IF NOT EXISTS device_keys (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  device_pubkey TEXT NOT NULL UNIQUE,           -- compressed SEC1 P-256, hex; account-level, never on an envelope
  label        TEXT,                            -- optional human label ("Alice's iPhone")
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ                      -- nullable; set on lost/retired device
);
CREATE INDEX IF NOT EXISTS device_keys_user ON device_keys (user_id);

-- Thread-scoped device signers (Method 3). PRIVATE — maps a PUBLISHED signer key (the envelope's
-- signerPubkey) to its device and verified user, WITHOUT putting that link on the record. Each
-- (device, thread) derives a distinct signer (see identity/device.ts), so the same device shows an
-- unrelated signer in every thread — no cross-thread correlator. appendSigned authorizes a signed
-- envelope by checking the signer maps to the SAME user (and thread) as the thread persona; any
-- enrolled device of that user may thus edit the user's content in the thread (cross-device edit).
CREATE TABLE IF NOT EXISTS thread_signers (
  signer_pubkey TEXT PRIMARY KEY,               -- compressed SEC1 P-256, hex; the published per-(device,thread) signer
  user_id       UUID NOT NULL REFERENCES users(id),
  device_id     UUID NOT NULL REFERENCES device_keys(id),
  thread_id     TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ                      -- nullable; revoke a single thread-scoped signer
);
CREATE INDEX IF NOT EXISTS thread_signers_user_thread ON thread_signers (user_id, thread_id);

-- KYC attestation STUB (tier carrier only; no provider integration this phase).
CREATE TABLE IF NOT EXISTS kyc_attestations (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  provider    TEXT NOT NULL,
  tier        TEXT NOT NULL,
  region      TEXT,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform-attested nullifiers — the authoritative one-per-(user, parent) dedupe for singleton
-- actions (vote/petition_signature/reaction). PK(user_id, parent_id) ⇒ one nullifier per user per
-- parent; UNIQUE(parent_id, nullifier) ⇒ no two users share a nullifier on a parent. platform_sig
-- is the platform's P-256 attestation that this nullifier belongs to a distinct verified user
-- (issuance trust = the KYC gap; a future zk proof makes it trustless). Created at first use.
CREATE TABLE IF NOT EXISTS nullifier_attestations (
  user_id      UUID NOT NULL REFERENCES users(id),
  parent_id    TEXT NOT NULL,
  nullifier    TEXT NOT NULL,
  platform_sig TEXT NOT NULL,
  membership_proof TEXT,                         -- RESERVED Method-4 (§5.5) ZK slot; NULL today. A future
                                                 -- zk-membership proof replaces platform_sig as the trust root.
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, parent_id),
  UNIQUE (parent_id, nullifier)
);
-- Idempotent migration for a persistent dev DB created before the membership_proof column existed.
ALTER TABLE nullifier_attestations ADD COLUMN IF NOT EXISTS membership_proof TEXT;

-- ── Fold-on-read projections (the "get latest state" views) ─────────────────────────────

-- Recreate the view tree from scratch so this DDL stays idempotent as the projection columns
-- evolve (CREATE OR REPLACE cannot change a view's column set; CASCADE drops dependents).
DROP VIEW IF EXISTS entity_state CASCADE;
DROP VIEW IF EXISTS entity_current_revision CASCADE;

-- Latest transaction per entity = its current state. Each create/update writes a FULL
-- content snapshot, so the latest content (and its embedded rules) wins.
CREATE OR REPLACE VIEW entity_state AS
SELECT DISTINCT ON (entity_id)
  entity_id,
  type,
  op                        AS latest_op,
  content,
  content_hash,
  author_pubkey,
  nullifier,
  parent_type,
  parent_id,
  parent_revision_hash,
  tx_id                     AS head_tx_id,
  tx_hash                   AS head_tx_hash,
  created_at,
  (op = 'delete')           AS is_deleted,
  (redacted_at IS NOT NULL) AS is_redacted,
  (erased_at IS NOT NULL)   AS is_erased
FROM record_tx
ORDER BY entity_id, seq DESC;

-- Latest non-deleted content revision per entity (ignores delete tombstones). Used to
-- resolve "the current revision" of a post/comment for revision-pinned comparisons.
CREATE OR REPLACE VIEW entity_current_revision AS
SELECT DISTINCT ON (entity_id)
  entity_id,
  type,
  tx_hash AS revision_hash,
  tx_id   AS revision_tx_id
FROM record_tx
WHERE op IN ('create','update')
ORDER BY entity_id, seq DESC;

-- Active reactions: the latest state of each reaction entity that is not deleted.
CREATE OR REPLACE VIEW active_reactions AS
SELECT entity_id, author_pubkey, nullifier, parent_id, parent_revision_hash, content->>'kind' AS kind
FROM entity_state
WHERE type = 'reaction' AND NOT is_deleted;

-- Reaction tallies, two ways: pinned to the parent ENTITY (follows edits) …
-- Tallies dedupe BY NULLIFIER (the authoritative one-per-(user,parent) key) so an auditor
-- reconstructing from the public record counts distinct verified participants, not rows.
-- Dedupe by the strongest available participant key: the NULLIFIER for signed singletons, falling
-- back to author_pubkey for unsigned dev-path rows (which carry no nullifier). So an auditor counts
-- distinct verified participants on the signed path while legacy/unsigned data still tallies.
CREATE OR REPLACE VIEW reaction_counts_by_entity AS
SELECT parent_id, kind, COUNT(DISTINCT COALESCE(nullifier, author_pubkey))::int AS count
FROM active_reactions
GROUP BY parent_id, kind;

-- … and pinned to the exact parent REVISION the reaction was given to (defeats edit-based
-- fake support: support stays bound to the content it endorsed).
CREATE OR REPLACE VIEW reaction_counts_by_revision AS
SELECT parent_revision_hash, kind, COUNT(DISTINCT COALESCE(nullifier, author_pubkey))::int AS count
FROM active_reactions
GROUP BY parent_revision_hash, kind;

-- Active (non-revoked) petition signatures + counts.
CREATE OR REPLACE VIEW active_signatures AS
SELECT entity_id, author_pubkey, nullifier, parent_id, parent_revision_hash
FROM entity_state
WHERE type = 'petition_signature' AND NOT is_deleted;

CREATE OR REPLACE VIEW petition_signature_counts AS
SELECT parent_id AS petition_id, COUNT(DISTINCT COALESCE(nullifier, author_pubkey))::int AS count
FROM active_signatures
GROUP BY parent_id;

-- Poll results: the latest non-deleted vote per voter, tallied by option (a changed vote
-- counts once — the latest wins). Deduped by nullifier (one verified participant per poll),
-- falling back to author_pubkey for unsigned dev-path votes.
CREATE OR REPLACE VIEW poll_results AS
SELECT parent_id AS poll_id, content->>'option' AS option, COUNT(DISTINCT COALESCE(nullifier, author_pubkey))::int AS count
FROM entity_state
WHERE type = 'vote' AND NOT is_deleted
GROUP BY parent_id, content->>'option';
`;
