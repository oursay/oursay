// DDL for the PUBLIC append-only chain on immudb 1.11.0 (reached over the pg-wire protocol).
//
// immudb speaks the Postgres WIRE protocol but not the full DIALECT — use raw SQL, fixed-width
// VARCHAR[N], and treat every row as append-only. This table stores commitments + the canonical
// envelope ONLY — never plaintext. The `envelope` column is the value that is hashed/verified;
// the flat columns are for convenience/indexing.

export const TABLE = "record_chain";

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
