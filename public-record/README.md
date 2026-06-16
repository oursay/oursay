# @oursay/public-record

The OurSay public record: civic actions modelled as **event-sourced CRUD over an append-only
verifiable chain**. Every create / edit / delete is a signed transaction that is never
physically removed; current state is a **fold** over that log. The append-only chain (immudb)
holds only **hash commitments**; the raw content lives in a separate **mutable Postgres** store
whose integrity those commitments protect.

> Status: **initial schema + verification chain + tests** (this phase). Real signing
> (Turnkey/BIP32), external anchoring, and KYC are later phases. The design doc is
> [`PROPOSAL.md`](./PROPOSAL.md); the normative requirements are [`REQUIREMENTS.md`](./REQUIREMENTS.md).

## Architecture

```
        PUBLIC, append-only (immudb, pg-wire)          PRIVATE, mutable (Postgres)
        ─────────────────────────────────────          ───────────────────────────
 append ─► record_chain                         <-->   record_tx  (event log)
            tx_id, type, entity_id, op,                  + raw content + salt (erasable)
            parent_id, parent_revision_hash,             + exact canonical envelope
            prev_hash, content_hash, tx_hash,          fold-on-read views:
            envelope (commitment only)                   entity_state, reaction_counts_by_*,
                 │                                       petition_signature_counts, poll_results
                 │ immudb_state() root  ── (future: external anchor)
                 ▼
        verifyEntityChain()  — recompute txHash, check prev_hash linkage,
                               confirm immudb agrees, recompute content commitment
```

- **Per-entity hash chain.** Each transaction's signed envelope carries `prevHash` = the prior
  transaction *of the same entity*, so an entity's history is an unbroken chain. immudb provides
  the global append-only ordering + the anchorable root.
- **Two stores.** immudb commits hashes; Postgres holds the data. Deleting appends a `delete`
  tx (state tombstoned); **erasing** destroys the plaintext + salt while the chain still
  verifies from hashes alone.
- **Signatures are stubbed** in this phase (`authorPubkey`/`signature` fields + author-match by
  equality); the per-entity hashing/verification is real.

## Content model

| type | parent(s) | ops | notes |
|---|---|---|---|
| `post` | none | create, update, delete | the generic primitive; product label "Belief" |
| `petition` | none | create, update, delete | rules at create (`region`, `deadline`, `allowRevoke`) |
| `poll` | none | create, update, delete | the question/container; rules (`allowChange`, `deadline`, options) |
| `comment` | post, petition, poll, comment | create, update, delete | nesting depth ≤ 3 |
| `reaction` | post, comment | create, update, delete | `check`/`cross`, mutually exclusive per author per target |
| `petition_signature` | petition | create, delete (revoke) | final by default; revoke gated by rules + deadline |
| `vote` | poll | create, update (change) | final by default; change gated by rules + deadline |

**Governance.** A poll/petition's `create` sets its `rules`; a **platform-signed** update can
change them. Vote-change and signature-revoke are FINAL by default (the real-world analog) and
only permitted when `rules.allowChange`/`allowRevoke` + a future `deadline` opt in (per
riding/region).

**Dual attachment targeting.** Comments and reactions record BOTH the parent **entity**
(`parentId`, follows edits) and the exact parent **revision** (`parentRevisionHash`). Counts are
exposed both ways — `reaction_counts_by_entity` and `reaction_counts_by_revision` — so support
stays bound to the content it endorsed (editing a post does not transfer endorsements to the new
text).

## Run

```bash
# from the repo root
npm install
npm run db:up   --workspace public-record   # immudb 1.11.0 (pg-wire) + postgres 16
npm run test    --workspace public-record   # 24 tests (8 suites)
npm run seed    --workspace public-record   # hands-on dev DB: prints folded state + chain verify
npm run db:down --workspace public-record   # tear down (wipes volumes)
```

Host ports are offset from `immudb-test` (immudb pg-wire **5443**, postgres **5442**) so both
stacks can run at once. No `.env` is needed; defaults match `docker-compose.yml`.

## Layout

| Path | Purpose |
|------|---------|
| `src/schema/types.ts` | record types, ops, `EntityRules`, `TxEnvelope`, parent/op tables |
| `src/schema/postgres.sql.ts` | `record_tx` event log + identity stubs + fold-on-read views |
| `src/schema/ledger.sql.ts` | immudb `record_chain` DDL (commitments only) |
| `src/crypto/*` | canonical JSON + salted commitment + RFC-6962 Merkle (promoted from immudb-test) |
| `src/ledger/connector.ts` · `pgwire.connector.ts` | pluggable chain transport (immudb pg-wire) |
| `src/ledger/chain.ts` | `PublicChain` — dual write (private store + append-only chain) |
| `src/private/store.ts` | `PrivateStore` — event log + redact/erase + fold queries + public (withholding) reads |
| `src/record.ts` | `RecordService` — validated CRUD + governance + semantic helpers |
| `src/governance.ts` | rules/deadline gating for vote-change & signature-revoke |
| `src/projection.ts` | `getThread` and reaction tallies (entity- and revision-pinned) |
| `src/verify.ts` | `verifyEntityChain` — per-entity chain + commitment verification |
| `scripts/seed.ts` | dev seed |
| `test/*.spec.ts` | 8 suites (create, attach, state-fold, governance, revision-pinning, chain, projections, redaction) |
| `TESTING-REPORT.md` | results, flow, scenario coverage, and known gaps |
