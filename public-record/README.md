# @oursay/public-record

The OurSay public record: civic actions modelled as **event-sourced CRUD over an append-only
verifiable chain**. Every create / edit / delete is a signed transaction that is never
physically removed; current state is a **fold** over that log. Writes are first **pooled** in a
**mutable Postgres** store (which also holds the raw content); the **append-only chain** (immudb)
receives the commitments — and a block header — only at **block settlement**, and external anchor
targets publish those blocks on their own cadence.

> Status: **schema + verification chain + block settlement & anchoring (dev)**. Pooled writes,
> the settlement boundary, an offline verifier, and a **file** `AnchorTarget` are implemented and
> tested. **External** anchoring — publishing roots to infra we do not control (Git transparency
> log, EVM, Solana) — is not yet wired; that is the earliest point we can claim third-party
> verifiability (testnet during development, production targets later).
>
> **Identity (implemented — full verified write path):** real **per-thread P-256 signing** is wired
> for **every civic op**. A client derives a per-thread key (HKDF from a jurisdiction master), runs
> `prepareAppend` for the server-derived fields, signs a canonical `TxEnvelope`, and
> `RecordService.appendSigned` verifies the signature, the private platform **registration binding**
> (opaque per-thread commitment, `binding_sig` re-verified), the content-model rules, thread-scope,
> and optimistic concurrency before the action enters the existing pool → settle path.
> - **2a — creates:** post/poll/petition + comment/reaction/vote/petition_signature. A
>   **platform-attested nullifier** (`H(level-secret, parentId)`) is the authoritative
>   one-per-`(user, parent)` dedupe — minted on the **create** only.
> - **2b — updates/deletes:** signed edits, vote-change, signature-revoke, deletes. Author-match is
>   **cryptographic** (the signature proves control of the entity's thread key). Singleton
>   update/delete **carry the original nullifier forward** (never re-minted); stale `prevHash` or a
>   moved parent revision is rejected (reject-and-retry).
> - **Freshness gate:** `appendSigned` rejects a signed envelope whose `createdAt` is too old (or too
>   far ahead of the server clock) — configurable via `SIGNED_ENVELOPE_MAX_AGE_SEC` (default 120;
>   `0` disables). Uses the existing `createdAt` (already signed) — no schema/wire change.
> See `src/identity/*`, `threadCommitment` in `src/crypto/commitment.js`, and suites
> `10-identity-crypto`, `12-signed-append`, `13-signed-ops`. The **unsigned dev path**
> (`create/update/delete/react/vote`) is retained for dev/seeds.
>
> **Now in progress:** the HTTP account API — [`@oursay/api`](../api/README.md) — covers email-OTP
> registration, passkey **sessions**, and recovery (it shares this package's Postgres; see below).
> **Still later (NOT done):** full **KYC provider** integration (only a tier stub today),
> **claim/unclaim** (R8/R9), **selective reveal** / user-signed bindings (R11), and at-rest PII/KMS
> encryption. See [`PROPOSAL.md`](./PROPOSAL.md) and [`REQUIREMENTS.md`](./REQUIREMENTS.md).
> Product policy for device signing and user data:
> [`../docs/08-IDENTITY-AND-DEVICE-POLICY.md`](../docs/08-IDENTITY-AND-DEVICE-POLICY.md).

## Architecture

```
   PRIVATE, mutable (Postgres)            PUBLIC, append-only (immudb, pg-wire)
   ───────────────────────────           ─────────────────────────────────────
 append ─► record_tx (event log)         record_chain   (commitments, batched at settle)
   (POOL)   + raw content + salt          record_blocks (height, seq range, bundleMerkleRoot,
            + canonical envelope                          chainTipHash, immudbRoot, prev links)
            + record_outbox (pending)            ▲
   fold-on-read views:                           │  BlockSettler.settleBlock()
     entity_state, reaction_counts_by_*,         │  (trigger: ≥ N pending OR oldest ≥ X hours)
     petition_signature_counts, poll_results     │
                                                 ▼
                       AnchorPublisher.maybePublish ──► FileAnchorTarget (dev; local files)
                          (per-target cadence)          future: Git · EVM · Solana connectors
                                                 │
   verifyEntityChain() (live, post-settle)       ▼   verifyBlock / verifyEntry / verifyChain
                                                     (offline, vs an independently-fetched root)
```

- **Pool, then settle.** `append` writes the private row and atomically enqueues its commitment
  (`record_outbox`, status `pending`) — nothing touches the chain yet. A **block** is settled from
  the pool when the trigger fires (≥ `BLOCK_MAX_PENDING` pending **or** the oldest has waited
  `BLOCK_MAX_PENDING_AGE_HOURS`, whichever first; never empty): its commitments are batch-appended
  to `record_chain` and a header lands in `record_blocks`. The age trigger is **operational cadence
  only** — it decides *when* to cut a block, never transaction order.
- **Per-entity hash chain.** Each transaction's signed envelope carries `prevHash` = the prior
  transaction *of the same entity*, so an entity's history is an unbroken chain. The chain (immudb)
  provides the global append-only witness + the anchorable root.
- **Block tip on the chain, chain-scoped.** `record_blocks` is keyed by `(chainId, blockHeight)` —
  a genesis/network id so one never-reset immudb can host many chains (one per governing body; a
  stable id per deployment, a fresh id per test/seed run). `record_chain` and the settlement pool
  (`record_outbox`) carry the same `chainId`, so a settler drains/commits only its own chain; the
  published `AnchorRecord` carries it too, and `verifyChain(anchors, chainId)` binds an audit to one
  genesis. Each block carries a `chainTipHash` (cumulative fold of the prior tip + this block's
  Merkle root) so "is the whole chain intact?" is one walk from genesis, plus reserved
  `proposer`/`attestations` for a future custodian quorum. (Postgres fold-on-read views stay
  single-tenant — one Postgres per body; multi-tenant content views are out of scope.)
- **Two stores.** immudb commits hashes; Postgres holds the data. Deleting appends a `delete`
  tx (state tombstoned); **erasing** destroys the plaintext + salt while the chain still
  verifies from hashes alone.
- **Signatures are stubbed** in this phase (`authorPubkey`/`signature` fields + author-match by
  equality); the per-entity hashing/verification is real.

### Chain identity (`CHAIN_ID`)

A `chainId` names **one public record** — one legal/custodial chain (e.g. one government body's
record), **not** a single global OurSay chain. Block headers and commitments are keyed by it, so one
shared immudb can host several independent records side by side.

- **Production:** a stable, human-auditable slug — e.g. `ca-ab-gov` (the Alberta first deployment).
  Set it once per deployment via the `CHAIN_ID` env var and never change it for that record.
- **Dev / test:** a fresh `randomUUID()` per run (immudb is never reset, so a new id keeps block
  heights starting at 1). `CHAIN_ID` defaults to `oursay-local` — for local development only.
- **Never reuse** a production id for a new genesis. If you ever intentionally start a fresh chain
  for the same body, bump a suffix (e.g. `ca-ab-gov-v2`); reusing the id would collide with the
  existing append-only history.
- The published `AnchorRecord.chainId` always matches the settled block header's `chainId`, and
  `verifyChain(anchors, expectedChainId)` lets an auditor bind a record to the genesis they expect.

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
npm run test    --workspace public-record   # 53 tests (11 suites)
npm run seed    --workspace public-record   # hands-on dev DB: prints folded state + chain verify
npm run db:down --workspace public-record   # tear down (wipes volumes; blocked when NODE_ENV=production)
```

Destructive npm scripts (`db:down`, `seed`, `reset`) and `PrivateStore.reset()` refuse to run when
`NODE_ENV=production`. Raw `docker compose down -v` is not gated — production hosts must not expose
the Docker socket to app processes (see `docs/08-IDENTITY-AND-DEVICE-POLICY.md` §11).

Host ports are offset from `immudb-test` (immudb pg-wire **5443**, postgres **5442**) so both
stacks can run at once. No `.env` is needed; defaults match `docker-compose.yml`.

**Shared with [`@oursay/api`](../api/README.md).** The account API uses this same Postgres instance,
adding its own **`auth` schema** (profiles, passkey credentials, sessions, OTPs) FK'd to
`public.users`. `npm run db:up -w @oursay/api` delegates here, so one `db:up` serves both packages.

## Block settlement & anchoring (dev) — external targets future

Two decoupled phases. **Settlement** drains the pending pool into a block on the append-only chain
(`record_chain` commitments + a `record_blocks` header) when the trigger fires. **Publication**
replicates settled blocks to a pluggable `AnchorTarget` on each target's own cadence. Each block
carries an app-level `bundleMerkleRoot` over its envelopes (offline verification), the `immudbRoot`
captured after the batch (ledger witness), and chaining metadata (`prevBlockRoot`,
`prevChainTipHash`, the cumulative `chainTipHash`, and `prevAnchorHash` linking published anchors).

**Settlement trigger** (`BlockConfig`, env-tunable): settle when `≥ BLOCK_MAX_PENDING` txs are
pending **or** the oldest pending tx has waited `≥ BLOCK_MAX_PENDING_AGE_HOURS` — whichever comes
first, never empty, capped at `BLOCK_MAX_TXS` per block. `0` disables a dimension. The trigger is
invoked explicitly (`maybeSettleBlock`) — wiring it to a worker/API is a later concern.

**What ships today:** `FileAnchorTarget` writes append-only local files for development and
testing. An **offline verifier** checks a block, a single entry, or the whole chain against a root
read from those files — exercising the publish/verify pipeline without the platform DB.

**What does not ship yet (external anchoring):** connectors that push anchors to infrastructure
we do not control — **Git** transparency log, **EVM** (L1/L2/testnet), **Solana**. R14's
“verify without trusting the platform” claim applies only once those targets are implemented,
verified, and used in dev (testnet) or production. The file target is the primitive those
connectors will publish the same artifacts through.

```ts
// 1. Pool writes (RecordService.create/update/... → PublicChain.append) accumulate in Postgres.
// 2. Settle a block from the pool onto the append-only chain.
const settler = new BlockSettler(store, connector, chainId);
await settler.maybeSettleBlock();          // settles iff the count/age trigger fires
// or settler.settleBlock() to force one, settler.flushPendingSettlement() to drain everything.

// 3. Publish settled blocks to a target (append-only: anchors.jsonl + blocks/block-NNNNN.json).
const target = new FileAnchorTarget("./.anchors");
const publisher = new AnchorPublisher(connector, new BundleAssembler(store), chainId);
await publisher.maybePublish(target);      // respects the target's cadence; .publish() forces it

// Auditor — offline, no DB/immudb. Root is fetched independently from the target.
const anchor = await target.fetchAnchor(1);
const bundle = await target.fetchBundle(1);
verifyBlock(bundle, anchor.bundleMerkleRoot);                    // whole block
verifyEntry(bundle.entries[0], anchor, anchor.bundleMerkleRoot); // a single entry
verifyChain(await target.listAnchors(), chainId);                // whole chain (bound to a genesis) → { ok, tipHash }
```

`FileAnchorTarget` writes human-readable, git-friendly files (an append-only `anchors.jsonl`
index + one bundle file per block). Anchor output dirs are gitignored. Suites 09/11 use a
throwaway temp dir — nothing is committed.

## Layout

| Path | Purpose |
|------|---------|
| `src/schema/types.ts` | record types, ops, `EntityRules`, `TxEnvelope`, parent/op tables |
| `src/schema/postgres.sql.ts` | `record_tx` event log + identity stubs + fold-on-read views |
| `src/schema/ledger.sql.ts` | immudb `record_chain` (commitments) + `record_blocks` (block headers) DDL |
| `src/crypto/*` | canonical JSON + salted commitment + RFC-6962 Merkle (promoted from immudb-test) |
| `src/ledger/connector.ts` · `pgwire.connector.ts` | pluggable chain transport (immudb pg-wire); tx + block batch/fetch |
| `src/ledger/chain.ts` | `PublicChain` — pooled write (private store + pending outbox; no per-tx chain write) |
| `src/ledger/settler.ts` | `BlockSettler` — settle the pool into a block (trigger policy + crash-safe retry) |
| `src/private/store.ts` | `PrivateStore` — event log + pool stats + redact/erase + fold queries + public reads |
| `src/record.ts` | `RecordService` — validated CRUD + governance + semantic helpers |
| `src/governance.ts` | rules/deadline gating for vote-change & signature-revoke |
| `src/projection.ts` | `getThread` and reaction tallies (entity- and revision-pinned) |
| `src/anchor/*` | `BundleAssembler`, `AnchorPublisher`, `AnchorTarget` + `FileAnchorTarget`, offline verifier |
| `src/verify.ts` | `verifyEntityChain` — per-entity chain + commitment verification |
| `scripts/seed.ts` | dev seed (creates, settles a block, publishes + verifies offline) |
| `test/*.spec.ts` | 11 suites (create, attach, state-fold, governance, revision-pinning, chain, projections, redaction, anchoring, settlement, settlement-cadence) |
| `TESTING-REPORT.md` | results, flow, scenario coverage, and known gaps |
