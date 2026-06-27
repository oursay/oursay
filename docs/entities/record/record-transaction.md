# RecordTransaction

## Definition

A single append-only event in the civic record — a create, update, or delete operation on one entity. The entity's current state is the **fold** of all its transactions ordered by global `seq`. Each transaction carries a canonical public envelope (commitment) and optional mutable plaintext content in Postgres.

## Aliases

| Layer | Name |
|-------|------|
| Code | `RecordTx`, `StoredTx`, `TxEnvelope`, `record_tx` |
| Ops | `create`, `update`, `delete` |
| Types | `RecordType` — see [entity catalog](../README.md) |

See [public-record/src/schema/types.ts](../../../public-record/src/schema/types.ts).

## Identity

- Transaction: `tx_id` (UUID) — unique per transaction.
- Entity: `entity_id` (UUID) — stable across entity lifecycle.
- Revision: `tx_hash` — content-addressed hash of canonical envelope.

## Attributes

### Stored row (`record_tx`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `tx_id` | UUID | yes | yes | PK |
| `seq` | BIGSERIAL | yes | yes | Global order |
| `type` | `RecordType` | yes | yes | Entity type |
| `entity_id` | UUID | yes | yes | Stable entity id |
| `op` | `Op` | yes | yes | CRUD verb |
| `parent_type`, `parent_id` | TEXT/UUID | attachments | yes | Entity-level parent |
| `parent_revision_tx_id`, `parent_revision_hash` | | attachments | yes | Revision pinning (R1b) |
| `author_pubkey` | TEXT | yes | yes | Pₜ |
| `signature` | TEXT | yes | yes | p256 or empty (WebAuthn) |
| `created_at` | TIMESTAMPTZ | yes | yes | Envelope timestamp |
| `prev_hash` | TEXT | no | yes | Per-entity chain link |
| `content_hash` | TEXT | yes | yes | Salted commitment |
| `nullifier` | TEXT | singletons | yes | Dedupe tag |
| `tx_hash` | TEXT | yes | yes | Envelope hash |
| `envelope` | TEXT | yes | yes | Canonical JSON |
| `salt`, `content` | TEXT/JSONB | yes | no | Erasable plaintext store |
| `redacted_at`, `erased_at` | TIMESTAMPTZ | no | no | Privacy lifecycle |

### TxEnvelope (public commitment)

Never contains plaintext. Key fields: `v`, `txId`, `type`, `entityId`, `op`, parent fields, `authorPubkey`, `signerPubkey`, `signScheme`, `signature`, `webauthn`, `createdAt`, `prevHash`, `contentHash`, `nullifier`.

### RecordType attachment rules

| Type | Root? | Parent types | Allowed ops |
|------|-------|--------------|-------------|
| `post` | yes | — | create, update, delete |
| `petition` | yes | — | create, update, delete |
| `poll` | yes | — | create, update, delete |
| `comment` | no | post, petition, poll, comment | create, update, delete |
| `reaction` | no | post, comment | create, update, delete |
| `petition_signature` | no | petition | create, delete |
| `vote` | no | poll | create, update |

## States & lifecycle

Entity flags (from latest tx):

| Flag | Condition |
|------|-----------|
| `is_deleted` | Latest `op = 'delete'` |
| `is_redacted` | `redacted_at IS NOT NULL` |
| `is_erased` | `erased_at IS NOT NULL` — content destroyed |

Per-entity hash chain: each tx links `prev_hash` → prior tx's `tx_hash` for same `entity_id`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| PublicRecord | N:1 | Enqueued to outbox on insert |
| ThreadPersona | N:1 | Via `author_pubkey` |
| Parent entity | N:1 | Attachments reference parent + revision |

## Invariants

- **R1 [Invariant]**: Append-only transactions for defined record types.
- **R1b [Invariant]**: Dual attachment — parent entity + parent revision ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- **R4–R5**: Ledger stores commitments only; content is salted/hiding.
- **R2**: Every entry signed by per-thread key.
- Verified users on-ledger; unverified actions Postgres-only (contributor §11.1).

## Permissions

| Action | Who |
|--------|-----|
| Append | Authenticated user with valid signature + nullifier (singletons) |
| Governance update | Platform-signed (`authorPubkey = PLATFORM_PUBKEY`) |
| Redact/erase | Platform privacy operations (R17–R19) |

## Events

- Insert: atomic enqueue to `record_outbox` (`pending`).
- Settlement: worker writes commitment to immudb, marks `sent`.

## Examples

**Valid:** `create` post with `{ title, body }`, signed envelope, `prev_hash: null`.

**Invalid:** Comment attached without both `parent_id` and `parent_revision_hash` — violates R1b.

## Implementation

| Layer | Path |
|-------|------|
| Types | `public-record/src/schema/types.ts` |
| DDL | `public-record/src/schema/postgres.sql.ts` |
| Store | `public-record/src/private/store.ts` |
| Write service | `api/src/services/civic-record.service.ts` |
| Routes | `api/src/http/routes/civic-record.routes.ts` |

## Gaps

- **[mvp-c4-action-snapshots]**: No geo/tier metadata snapshot at submit time on tx row.
