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

-- Settlement pool / transactional outbox. Each record_tx insert atomically enqueues its commitment
-- here (same Postgres transaction) as 'pending', so a crash before settlement can never orphan a
-- record: the pending row is settled to immudb idempotently by BlockSettler (which batches pending
-- rows into a block). enqueued_at is the ingestion clock the settlement age-trigger reads. The
-- payload is the exact ChainRow (commitments + canonical envelope ONLY — never plaintext/salt), so
-- settlement is self-contained and unaffected by later redaction/erasure of record_tx.
CREATE TABLE IF NOT EXISTS record_outbox (
  tx_id       UUID PRIMARY KEY REFERENCES record_tx(tx_id),
  payload     JSONB        NOT NULL,
  status      TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent')),
  attempts    INT          NOT NULL DEFAULT 0,
  last_error  TEXT,
  enqueued_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS record_outbox_pending ON record_outbox (enqueued_at) WHERE status = 'pending';

-- Identity stubs (full Turnkey/BIP32 module is a later phase).
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY,
  handle     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS thread_keys (
  pubkey    TEXT PRIMARY KEY,
  user_id   UUID REFERENCES users(id),
  thread_id TEXT
);

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
SELECT entity_id, author_pubkey, parent_id, parent_revision_hash, content->>'kind' AS kind
FROM entity_state
WHERE type = 'reaction' AND NOT is_deleted;

-- Reaction tallies, two ways: pinned to the parent ENTITY (follows edits) …
CREATE OR REPLACE VIEW reaction_counts_by_entity AS
SELECT parent_id, kind, COUNT(*)::int AS count
FROM active_reactions
GROUP BY parent_id, kind;

-- … and pinned to the exact parent REVISION the reaction was given to (defeats edit-based
-- fake support: support stays bound to the content it endorsed).
CREATE OR REPLACE VIEW reaction_counts_by_revision AS
SELECT parent_revision_hash, kind, COUNT(*)::int AS count
FROM active_reactions
GROUP BY parent_revision_hash, kind;

-- Active (non-revoked) petition signatures + counts.
CREATE OR REPLACE VIEW active_signatures AS
SELECT entity_id, author_pubkey, parent_id, parent_revision_hash
FROM entity_state
WHERE type = 'petition_signature' AND NOT is_deleted;

CREATE OR REPLACE VIEW petition_signature_counts AS
SELECT parent_id AS petition_id, COUNT(*)::int AS count
FROM active_signatures
GROUP BY parent_id;

-- Poll results: the latest non-deleted vote per voter, tallied by option (a changed vote
-- counts once — the latest wins).
CREATE OR REPLACE VIEW poll_results AS
SELECT parent_id AS poll_id, content->>'option' AS option, COUNT(*)::int AS count
FROM entity_state
WHERE type = 'vote' AND NOT is_deleted
GROUP BY parent_id, content->>'option';
`;
