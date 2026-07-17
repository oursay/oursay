# Handoff — Block height on `record_chain` + `record_tx`

**Status: landed.** No implementation drift from the document-first proposal.

**Branch:** current working tree  
**Authoritative entity doc:** [`docs/entities/record/public-record.md`](../entities/record/public-record.md)  
**Plan (context):** Cursor plan `block_height_relocation_2fbf46d9`

**No assumptions — ask the user when staging wipe scope, production migration, or explorer follow-up timing are ambiguous.**

**Validation:**

- `npm run typecheck -w @oursay/public-record; npm run typecheck -w @oursay/api`
- `npx mocha --grep="10 settlement|16 worker|externallyAnchored|18 pool"`
- `npm run typecheck; npm test` from `public-record` (180 passing)

---

## Decision

`block_height` belongs with the **settled commitment**, not the clearable settlement queue.

| Store | Role of height |
|-------|----------------|
| immudb `record_chain.block_height` | Canonical stamp at settle (when the batch is written) |
| Postgres `record_tx.block_height` | Private mirror for cheap feed/detail/explorer reads |
| `record_outbox` | Queue only (`pending` / `sent`) — **no** `block_height` |
| `anchor_publish_cursor` | Public-witness tip (EVM); product API stays a **bool** |

Product rule unchanged: `externallyAnchored` is true when the entity's create tx has `block_height >= 1`, outbox status `sent`, and `MAX(anchor_publish_cursor.tip_height)` for that chain covers the height. File-only publish does not advance the cursor.

Staging wipe after schema change (few demo records). Preserve auth/identity. No production backfill inventiveness.

---

## Schema (as landed)

### immudb `record_chain` — `public-record/src/schema/ledger.sql.ts`

`LEDGER_DDL` includes:

```sql
block_height INTEGER,  -- settled block height stamped at appendTxBatch; required at settle
```

immudb uses `CREATE TABLE IF NOT EXISTS` only — existing per-jurisdiction DBs do **not** auto-migrate. Staging wipe drops the immudb volume (or `dropDatabase` per chain). Fresh DBs get the column from DDL.

### Postgres `record_tx` — `public-record/src/schema/postgres.sql.ts`

```sql
ALTER TABLE record_tx ADD COLUMN IF NOT EXISTS block_height INT;
CREATE INDEX IF NOT EXISTS record_tx_block_height ON record_tx (block_height) WHERE block_height IS NOT NULL;
```

NULL until settle; then set to the block height that contains the tx.

### Postgres `record_outbox`

`block_height` **removed**. Idempotent cleanup for reused volumes:

```sql
ALTER TABLE record_outbox DROP COLUMN IF EXISTS block_height;
```

`anchor_publish_cursor` unchanged.

---

## Settlement write order

`BlockSettler.settleBlock`:

1. Drain pending for `chainId`; reconcile already-settled rows (see below).
2. Compute header (`blockHeight`, seq window, Merkle root, …).
3. `appendTxBatch(chainId, rows, blockHeight)` — each `record_chain` row stamped with height.
4. `appendBlock(header)`.
5. `markTxBlockHeightBatch(txIds, height)` — mirror onto `record_tx`.
6. `markOutboxSentBatch(txIds)` — status/`sent_at` only (no height).

Crash-reconcile (header/chain already cover `seq ≤ fromSeq`, outbox still pending):

- Read height from immudb `record_chain` via `getBlockHeightForTx`.
- Mirror onto `record_tx` when height ≥ 1.
- Mark outbox `sent` without inventing height.

---

## Product API

- DTOs keep `externallyAnchored: boolean` (not the raw tip).
- `getExternallyAnchoredFlags` reads `record_tx.block_height` + outbox `status`/`chain_id` vs `getPublicWitnessTips`.
- UI / EVM cadence unchanged.

---

## Explorer follow-up (out of scope for this build)

Today explorer derives membership from `record_blocks` `(fromSeq, toSeq]` → `getTxsBySeqRange`, and `getTx` walks tip→genesis in `findBlockHeightForSeq`.

**Preferred next change:** use `record_tx.block_height` for:

- `GET …/txs?block=N` → `WHERE block_height = N` (still validate header exists)
- `GET …/tx/:id` → read mirrored height; drop O(tip) header walk

Header + seq-range remain the auditor-facing membership proof; the column is a denormalized cache aligned with the ledger stamp.

---

## Files touched

| Area | Path |
|------|------|
| Entity doc | `docs/entities/record/public-record.md` |
| This handoff | `docs/temp/BLOCK-HEIGHT-HANDOFF.md` |
| Ledger DDL | `public-record/src/schema/ledger.sql.ts` |
| Postgres DDL | `public-record/src/schema/postgres.sql.ts` |
| Types | `public-record/src/ledger/connector.ts` |
| Connector | `public-record/src/ledger/pgwire.connector.ts` |
| Store | `public-record/src/private/store.ts` |
| Settler | `public-record/src/ledger/settler.ts` |
| Tests | `public-record/test/10-outbox.spec.ts`, `16-worker.spec.ts`, `21-externally-anchored.spec.ts` (+ reconcile coverage) |
| Wipe SQL | `public-record/scripts/wipe-civic-staging.sql` |

---

## Staging wipe runbook (preserve users / KYC / auth)

**Goal:** delete posts, comments, reactions, outbox, anchor cursors, civic projections; reset immudb; keep `users`, thread identity, `auth.*`, `geo.*`.

Root compose project: `oursay` ([`docker-compose.prod.yml`](../../docker-compose.prod.yml)). Volumes: `oursay_public_record_pg`, `oursay_public_record_immudb`.

Staging host is **Ubuntu** — run these from the repo root on the VPS (bash).

### 1. Stop writers

```bash
docker compose -p oursay -f docker-compose.prod.yml stop worker api
```

### 2. Postgres civic TRUNCATE

```bash
docker exec -i oursay-public-record-pg psql -U oursay -d oursay_public_record < public-record/scripts/wipe-civic-staging.sql
```

(Adjust `-U` / `-d` if `.env` overrides `PGUSER` / `PGDATABASE`.)

SQL truncates: `mention_index`, `mention_map`, `share_marks`, `record_action_geo`, `entity_audience`, `anchor_publish_cursor`, `record_outbox`, `record_tx`.

**Preserved:** `users`, `thread_*`, `device_keys`, `jurisdiction_master_keys`, `kyc_attestations`, `nullifier_attestations`, `auth.*`, `geo.*`.

### 3. Reset immudb (append-only — drop volume)

```bash
docker compose -p oursay -f docker-compose.prod.yml stop immudb
docker compose -p oursay -f docker-compose.prod.yml rm -f immudb
docker volume rm oursay_public_record_immudb
```

### 4. Redeploy

```bash
docker compose -p oursay -f docker-compose.prod.yml up -d --build postgres immudb worker api
```

Verify: empty public feed; existing logins/KYC still work; new posts settle with `record_tx.block_height` set.

---

## Out of scope

- UI changes
- Changing EVM publish cadence
- Backfilling old rows without wipe
- Explorer query simplification (documented above only)
