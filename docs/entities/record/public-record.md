# PublicRecord

## Definition

The tamper-evident, append-only verifiable ledger holding **salted hash commitments and public metadata only** — paired with Postgres for mutable plaintext. Actions are pooled in Postgres, settled into blocks on immudb, then anchored to external public infrastructure. Trust root is the **published anchor + offline verifier**, not the platform.

## Aliases

| Layer | Name |
|-------|------|
| Product | Public record / distributed public database / audit ledger |
| Internal | immudb + external anchoring |
| Components | `record_chain`, `record_blocks`, `record_outbox` |

See [01-CONTRIBUTOR-SPEC.md §11](../../01-CONTRIBUTOR-SPEC.md) and [REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md).

## Identity

- **Chain entry:** keyed by commitment in `record_chain`.
- **Block:** `(chain_id, block_height)` in `record_blocks`.
- **Outbox row:** `tx_id` → pending settlement item.

## Attributes

### record_outbox (settlement queue)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `tx_id` | UUID | yes | FK → `record_tx` |
| `chain_id` | TEXT | yes | Target jurisdiction chain |
| `payload` | JSONB | yes | ChainRow — commitments + envelope only |
| `status` | `pending` \| `sent` | yes | Settlement state |
| `attempts`, `last_error` | | | Retry metadata |
| `enqueued_at`, `sent_at` | TIMESTAMPTZ | | |

### record_chain (immudb)

Commitment rows — no plaintext.

### record_blocks

Settlement block headers with Merkle root over entries; `(chain_id, block_height)` PK.

## States & lifecycle

```
[record_tx insert + outbox pending]
        │ BlockSettler (count/age trigger)
        ▼
[outbox sent — commitment on immudb]
        │ anchor cadence
        ▼
[external anchor published (e.g. Ethereum)]
```

Settlement and anchoring are **distinct** steps (contributor §3.4).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| RecordTransaction | 1:1 | Each tx enqueues one outbox row |
| Jurisdiction | N:1 | Via `chain_id` |
| Build hash | periodic | Production deployments anchored ([DEPLOYMENTS.md](../../../DEPLOYMENTS.md)) |

## Invariants

- **R4 [Invariant]**: Public record MUST NOT store plaintext or PII.
- **R5 [Invariant]**: Commitments MUST be hiding (salted).
- **R6 [Invariant]**: Raw content in separate mutable Postgres store.
- Verified-only writes on ledger (contributor §11.1):
  - Verified: signoffs, votes, signatures, reactions, comments (all registered — see spec)
  - Unverified: Postgres only
- Published results are derived/published, not user-appended (contributor §8.4).
- Public language: no "blockchain/wallet/on-chain" in user-facing copy (contributor §11.5).

## Permissions

| Action | Who |
|--------|-----|
| Append (via tx) | Verified users (per type rules) |
| Settle | Platform worker (`BlockSettler`) |
| Anchor | Platform ops |
| Verify | Anyone offline with verifier tooling |

## Events

- Pool: tx insert atomically enqueues outbox.
- Settle: batch pending → immudb block.
- Anchor: block root published externally.
- Build verification: deployment hash in DEPLOYMENTS.md + anchored.

## Examples

**Valid:** Verified user's vote commitment settled to `ab-ca-gov` chain, later anchored — offline verifier reproduces count.

**Invalid:** Storing petition body text on immudb chain row.

## Implementation

| Layer | Path |
|-------|------|
| Requirements | `public-record/REQUIREMENTS.md` |
| Proposal | `public-record/PROPOSAL.md` |
| Ledger DDL | `public-record/src/schema/ledger.sql.ts` |
| Outbox | `public-record/src/schema/postgres.sql.ts` |
| Worker | Settlement worker (`WORKER_CHAIN_IDS`) |

## Platform-signed records (future, unimplemented)

A class of records authored by the **platform key** rather than a participant persona — documented here as design intent, not yet built:

- Final tallies and **tally amendments** (corrections to a published count).
- **Censorship reasoning** (why a record was redacted/removed).
- **District boundary revisions** (a redraw published as a signed record).
- **Official profiles** (MLA / premier / agency), distinct from participant accounts.
- **Post Archiving** when the platform has been required to archive the post/statement to comply with lawful requests.

Comments and reactions *on* official records are a further future step. See [record/future.md](./future.md).

## Gaps

- **[mvp-c13-signed-count-snapshots]**: No platform-signed count manifests (R26).
- **[mvp-c12-poll-results]**: Formal derived result publish not complete.
- Platform-signed records (tallies, amendments, censorship reasoning, boundary revisions, official profiles, post archiving) — see [record/future.md](./future.md).
- External anchoring cadence / production deploy hashes — launch blocker per PRD open questions.
