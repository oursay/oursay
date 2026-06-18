// DDL for the PUBLIC append-only chain on immudb 1.11.0 (reached over the pg-wire protocol).
//
// immudb speaks the Postgres WIRE protocol but not the full DIALECT — use raw SQL, fixed-width
// VARCHAR[N], and treat every row as append-only. This table stores commitments + the canonical
// envelope ONLY — never plaintext. The `envelope` column is the value that is hashed/verified;
// the flat columns are for convenience/indexing.

export const TABLE = "record_chain";
export const BLOCKS_TABLE = "record_blocks";

export const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  tx_id                VARCHAR[64],
  type                 VARCHAR[24],
  entity_id            VARCHAR[64],
  op                   VARCHAR[8],
  parent_type          VARCHAR[24],
  parent_id            VARCHAR[64],
  parent_revision_hash VARCHAR[64],
  author_pubkey        VARCHAR[128],
  signature            VARCHAR[256],
  created_at           VARCHAR[32],
  prev_hash            VARCHAR[64],
  content_hash         VARCHAR[64],
  tx_hash              VARCHAR[64],
  envelope             VARCHAR[8192],
  PRIMARY KEY (tx_id)
)`;

// Block headers — the SETTLEMENT boundary on the append-only chain. A block is committed here only
// when the settlement policy fires; the per-tx commitment rows go to record_chain in the same
// settlement. The tip (height, chain-tip hash) of THIS chain is read back from here, so the next
// block chains deterministically onto the last.
//
// PRIMARY KEY is (chain_id, block_height): chain_id is a genesis/network id. immudb is append-only
// and is never reset, so a single height column would collide across deployments/test runs. Keying
// by chain lets each genesis (incl. a fresh per-test-run id) start cleanly at height 1 while immudb
// stays append-only. block_height PK also makes a duplicate settle at the same height a safe no-op.
//
// Nullable-at-genesis fields (prev_block_root, prev_chain_tip_hash) are stored as "" — immudb
// dislikes NULLs in indexed columns — and mapped back to null on read.
export const BLOCKS_DDL = `
CREATE TABLE IF NOT EXISTS ${BLOCKS_TABLE} (
  chain_id             VARCHAR[64],
  block_height         INTEGER,
  from_seq             INTEGER,
  to_seq               INTEGER,
  tx_count             INTEGER,
  bundle_merkle_root   VARCHAR[64],
  chain_tip_hash       VARCHAR[64],
  prev_block_root      VARCHAR[64],
  prev_chain_tip_hash  VARCHAR[64],
  immudb_db            VARCHAR[64],
  immudb_tx_id         INTEGER,
  immudb_tx_hash       VARCHAR[64],
  captured_at          VARCHAR[32],
  PRIMARY KEY (chain_id, block_height)
)`;
