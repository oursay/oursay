// DDL for the PUBLIC append-only chain on immudb 1.11.0 (reached over the pg-wire protocol).
//
// immudb speaks the Postgres WIRE protocol but not the full DIALECT — use raw SQL, fixed-width
// VARCHAR[N], and treat every row as append-only. This table stores commitments + the canonical
// envelope ONLY — never plaintext. The `envelope` column is the value that is hashed/verified;
// the flat columns are for convenience/indexing.

export const TABLE = "record_chain";
export const BLOCKS_TABLE = "record_blocks";

// `chain_id` labels which chain (genesis/network) a commitment belongs to. Each jurisdiction is its
// own immudb *database* (snake_case of the slug) under one instance/`ledgerId` — see
// docs/spikes/immudb/DB-PER-JURISDICTION.md — so rows in this table are already scoped to one chain's
// DB. `chain_id` remains a COLUMN (not part of the PK): `tx_id` is a UUID, unique within the DB, and
// keeping `tx_id` the sole PK leaves `immudb_verify_row` / point reads single-key and unchanged.
export const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  tx_id                VARCHAR[64],
  chain_id             VARCHAR[64],
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
// PRIMARY KEY is (chain_id, block_height): within one per-jurisdiction database the chain_id matches
// that DB's slug, but the composite key keeps headers self-describing for export/verify. immudb DBs
// are append-only and never reset in place — removal is drop/unload of that database. A fresh
// chainId (incl. per-test-run) gets a new DB so heights start at 1. Duplicate settle at the same
// height is a safe no-op.
//
// Nullable-at-genesis fields (prev_block_root, prev_chain_tip_hash) are stored as "" — immudb
// dislikes NULLs in indexed columns — and mapped back to null on read.
//
// `proposer` + `attestations` reserve doc 07 §4's consensus-ready header: WHO attests a block,
// separate from WHAT it commits (the Merkle root). Stage 1 settles with proposer "" (→ null) and
// attestations "[]"; reserving them now means adding a custodian quorum later is not a breaking
// change to the header / anchor format. `attestations` is a JSON array of {pubkey,signature}.
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
  proposer             VARCHAR[128],
  attestations         VARCHAR[4096],
  captured_at          VARCHAR[32],
  PRIMARY KEY (chain_id, block_height)
)`;
