# public-record — testing report

_First end-to-end exercise of the event-sourced public record. Stack: immudb **1.11.0**
(PostgreSQL wire protocol) + Postgres **16** in Docker; tests in Mocha/Chai (TypeScript via
tsx). **78 tests across 14 suites, all green.** Real **per-thread P-256 signing** is wired for the
**full verified write path** — all creates (2a) and updates/deletes (2b) — via
`prepareAppend` + `RecordService.appendSigned` + `identity/*`; the unsigned dev path is retained for
seeds. The per-entity hash chain, the **pool → block-settlement**
boundary (chain-scoped by `chainId`), the file target + publish cadence, and the offline verifier are
real. **External** anchoring (Git / EVM / Solana) is not yet implemented._

## TL;DR

- **The model works.** Create/edit/delete are append-only transactions; current state is a
  fold over the log; the append-only chain (immudb) holds only commitments while the raw
  content lives in mutable Postgres. All 78 tests pass.
- **Writes are pooled, then settled in blocks (durable + crash-safe).** `append` writes the
  private row and **atomically enqueues** the commitment (`record_outbox`, `pending`) in one
  Postgres transaction — nothing reaches the chain yet. A **block** is settled from the pool when
  the trigger fires (≥ N pending **or** the oldest waited ≥ X hours; never empty; capped at
  `BLOCK_MAX_TXS`): its commitments are batch-appended to `record_chain` and a header lands in
  `record_blocks`, then the pool is marked sent. Settlement is **idempotent and crash-safe** — a
  crash mid-batch, after the header, or before the mark is reconciled on the next settle without
  double-writing — and a failed batch applies the **healthcheck-gated retry policy** (default
  "3-3-3", env-configurable; `0` = indefinite). See suite 10.
- **Block settlement + publish cadence works (dev).** Blocks settle on a count/age trigger; an
  `AnchorPublisher` replicates settled blocks to a **file** target on a per-target cadence (every
  N blocks, in order); an **offline verifier** checks a single entry, a whole block, or the whole
  chain (`verifyChain` → tip) against a root read from that target — no DB/immudb at verify time.
  See suites 09 and 11. **External** anchoring (publishing to Git / EVM testnet / production
  chain) is still future; that is when we can claim verification without trusting the platform.
- **Platform removal without breaking the audit trail is implemented and tested** (your
  question): **redaction** withholds plaintext from every response while **retaining** the raw
  in the mutable store; **erasure** destroys it. In both cases the commitment stands in and the
  chain still verifies. See suite 08.
- **Tampering with the mutable store is detected** (the commitment no longer matches), while
  **true erasure still verifies** on hashes alone. See suite 06.
- **Comments and reactions on roots and on comments are covered** (your question): comments on
  post/petition/poll and comment-on-comment (depth ≤ 3); reactions on post and on comment.
  See suites 02 and 07.
- **Governance works**: votes/signatures are final by default; change/revoke is gated by the
  entity's rules + deadline; a platform-signed rules update flips a forbidden change to allowed.
- **Anti-manipulation works**: editing a parent does not transfer the support its old content
  earned to the new content (revision-pinned vs entity-pinned counts).

---

## 1. How a transaction flows (end to end)

```
RecordService.create/update/delete
  │  validate: parent rules, comment depth ≤ 3, singleton (1 reaction/vote/signature per
  │            author per parent), op allowed, author match, governance gate (vote/sig)
  ▼
build TxEnvelope { txId, type, entityId, op, parent + parentRevision, prevHash, contentHash }
  │  contentHash = sha256(canonical{ds,id=txId,salt,content})   (salt is per-tx, secret)
  │  prevHash    = the entity's current head txHash (per-entity chain link)
  ▼
PublicChain.append(envelope, {salt, content})            [POOL — one Postgres tx, atomic]
  ├─►  Postgres record_tx     : raw content + salt (erasable) + EXACT canonical envelope
  └─►  Postgres record_outbox : commitment (ChainRow), status 'pending'   (no chain write yet)
  ▼
txHash = hashLeaf(canonicalJson(envelope))   → becomes the next same-entity tx's prevHash

BlockSettler.settleBlock()                               [SETTLE — when the trigger fires]
  ├─►  immudb record_chain  : batch-append the block's commitments (idempotent)  [append-only]
  ├─►  immudb record_blocks : header { (chainId,height), seq range, bundleMerkleRoot,
  │                                    chainTipHash, immudbRoot (post-batch), prev links }
  └─►  Postgres record_outbox: mark the block's rows 'sent'

AnchorPublisher.maybePublish(target)                     [PUBLISH — per-target cadence]
  └─►  FileAnchorTarget : anchors.jsonl + blocks/block-NNNNN.json  (every N blocks, in order)
```

Reads are **fold-on-read**: SQL views (`entity_state`, `reaction_counts_by_entity`/`_by_revision`,
`petition_signature_counts`, `poll_results`) compute current state from the log. Public
responses go through `toPublicView` / `getThread`, which **withhold** content for redacted or
erased entities (the hash stands in).

Verification (`verifyEntityChain`) walks an entity's transactions and checks: (1) each stored
envelope hashes to its recorded `txHash`, (2) the `prevHash` chain is unbroken, (3) immudb's
committed envelope matches and `immudb_verify_row` passes, (4) revealed content recomputes its
commitment (erased entries pass on hash alone).

A real seed run (`npm run seed`) ends like this:

```
post reactions (entity-pinned): [ { kind: 'check', count: 3 } ]
post reactions (current revision): []        ← an edit reset current-revision support
reactions still pinned to the ORIGINAL revision: [ { kind: 'check', count: 3 } ]
poll results: [ { option: 'no', count: 1 }, { option: 'yes', count: 2 } ]   ← a voter switched
petition signatures (active): 2              ← three signed, one revoked
deleted post is tombstoned: true
settled 1 block(s) on chain <uuid>           ← block 1: 20 tx, root …, tip …
published block(s) [1] to <tmp>/oursay-seed-anchor-…
offline chain verify: OK (tip …)            ← verifyChain over the published anchors
chain verification — post: OK (2 tx) · poll: OK (1 tx) · petition: OK (1 tx)
```

---

## 2. Your two questions, specifically

### a) Platform removal (hash replacement) keeping data in the mutable DB, never serving it

**Yes — implemented and tested (suite 08).** Two distinct operations:

- **Redaction** (`store.redact(txId)`): sets `redacted_at`. The raw content **stays** in
  Postgres (retained for lawful access), but every public response withholds it — `getEntityStatePublic`
  and `getThread` return `content: null`, `withheld: true`, and the `contentHash` in its place.
  The append-only chain is untouched, so verification still passes. The test asserts the
  withheld text never appears in the thread response **and** that an internal read still holds
  the retained raw, **and** that the chain verifies.
- **Erasure** (`store.erase(txId)`): nulls `content` + `salt`. The plaintext is physically
  gone; the public view still withholds, the internal read is now also empty, and the chain
  **still verifies on hashes alone** (the verdict for that tx is `contentMatches: "erased"`).

This is the "the data always exists as a commitment, but we don't distribute it" guarantee:
the timestamp, author key, parent, and all metadata stay public; only the message is replaced
by its hash.

### b) Comments and reactions on root entities and on comments

**Yes — covered (suites 02 and 07).**
- Comments attach to **posts, petitions, polls** (roots) and to **other comments** (nested),
  with **depth ≤ 3** enforced (a 4th level is rejected).
- Reactions attach to **posts** and **comments** — and are **rejected** on petitions/polls (to
  avoid confusing a reaction with official support).
- Suite 07 assembles a real thread: a post with a top-level comment, a nested reply, and
  reaction tallies.

---

## 3. Test inventory (14 suites · 78 tests)

| Suite | Tests | What it proves |
|---|---|---|
| 01 create | 3 | roots create; after settlement immudb holds commitments only (no plaintext); content in Postgres; `immudb_verify_row` passes; poll/petition carry rules |
| 02 attach | 4 | parent rules (comment→post/petition/poll/comment, reaction→post/comment, signature→petition, vote→poll); reactions rejected on petition/poll; depth ≤ 3; one active vote/signature per author per parent |
| 03 state-fold | 4 | edit folds to new content, history retained; reaction mutual-exclusion (check→cross flips); delete tombstones, history remains; only author/platform may modify |
| 04 governance | 4 | vote change allowed only with `allowChange` + before deadline; rejected when final or expired; signature revoke gated likewise; platform rules update flips forbidden→allowed |
| 05 revision-pinning | 1 | editing a parent keeps support pinned to the original revision; entity-pinned follows, revision-pinned does not transfer |
| 06 chain | 3 | full create→update chain verifies; raw-content tampering in Postgres is detected; true erasure still verifies (hash-only) |
| 07 projections | 3 | `getThread` (nested comments + reaction tallies); poll results by option; active signature counts (minus revoked) |
| 08 redaction | 2 | redaction withholds from responses while retaining raw + chain intact; erasure destroys raw + chain verifies on hashes |
| 09 anchoring | 14 | settle a block then publish it to a target; reproducible bundles across two independent targets; `bundleMerkleRoot` ↔ Merkle over envelopes; genesis chain-tip fold + reserved empty `proposer`/`attestations`; published anchor carries `chainId`; `immudbRoot` captured after the batch; append-only target; offline full-block + single-entry + whole-chain (`verifyChain(.., chainId)`, incl. wrong-chain rejection) verify against an independently-fetched root; block chaining (`prevBlockRoot`/`chainTipHash`/`prevAnchorHash`); redacted/erased withheld at publish; seq-range + target-integrity + tamper detection |
| 10 settlement | 10 | `append` only pools (private row + `pending` outbox tagged with `chainId`; not on the chain until settled); a crash-orphaned pool tx settles on a later sweep so the chain verifies; pre-delivered / re-settle never double-write (immudb `PRIMARY KEY` + `getEnvelope` guard); crash-after-header is reconciled to "sent" with no second block, and a FULL reconcile window still fully drains (no early stop); an enqueue failure rolls the private write back (true atomicity); the retry policy retries while healthy, backs off + re-healthchecks while down, gives up after `healthcheckAttempts` (pool stays pending), and `0` = indefinite |
| 11 settlement-cadence | 5 | count trigger holds below N then settles, capping the block at `BLOCK_MAX_TXS`; age trigger settles a lone old pending tx below the count (via injected `now`); file target publishes every 2 settled blocks, in order, and the bundles verify offline; re-evaluating with no new pending is a no-op; **chain isolation** — two chains share one Postgres pool + immudb and each settler drains/commits only its own `chainId` (neither sweeps the other; both start at height 1) |
| 10 identity-crypto | 11 | **(no DB)** HKDF per-thread derivation deterministic + domain-separated by `thread_id`/`level`, valid P-256 scalar (frozen `threadPubkey` vector); `signEnvelope`/`verifyEnvelope` sign+verify, tamper ⇒ reject, leaf == `txHashOf` (frozen `signature`/`txHash`); `threadCommitment` deterministic/opaque; **nullifier** derivation deterministic, unlinkable across parents/levels, distinct from the thread key |
| 12 signed-append | 5 | `verifyThreadBinding` true for a registered key / false for an unregistered one; verified-tier `post` create flows register → sign → `appendSigned` → settle, commitment lands on immudb (`verifyRow`) with the envelope carrying `thread_pubkey` only (no commitment / `salt_t` / `user_id` / plaintext); rejects an unregistered key (no pool row), a tampered signature, a `contentHash` mismatch, and a non-`create` op |
| 13 signed-ops | 9 | **2a creates** — every type (post/poll/petition + comment/reaction/vote/petition_signature) via prepare→sign→append→settle, tallies count one verified participant; **reaction one-per-(user,parent)** (distinct comments OK, repeat on same comment rejected); same-user re-vote + cross-user nullifier replay rejected; non-singleton-with-nullifier / stale parent-revision rejected. **2b updates/deletes** — signed post edit; vote change (allowed w/ rules, rejected when final); signature revoke (allowed w/ rules, else rejected); reaction kind change (same nullifier, count 1); **stale `prevHash`** + **cross-author edit** rejected |

Run: `npm run db:up --workspace public-record` then `npm run test --workspace public-record`
(suite 10-identity-crypto also runs standalone without the DB).

---

## 4. Requirement coverage

| Requirement (REQUIREMENTS.md) | Where proven |
|---|---|
| R1 record types + attachment/op rules + depth ≤ 3 | 02 |
| R1 reaction kinds mutually exclusive | 03 |
| R1a governance (vote-change / signature-revoke gating; platform rules update) | 04 (unsigned); 13 (on the **signed** path) |
| R1b dual attachment (entity vs revision pinning) | 05 |
| R2 per-thread signing (all civic ops — creates + updates/deletes) | 10, 12, 13 (`signEnvelope`/`verifyEnvelope` + `prepareAppend`/`appendSigned`) |
| R3 deterministic per-thread derivation (HKDF→P-256) | 10 |
| R7 ownership without exposure (private binding + opaque commitment; `binding_sig` re-verify) | 12 |
| R4/R5 commitments-only ledger + hiding (salted) | 01, 06 |
| R6 mutable private store (redact/erase real) | 08 |
| R12/R13 reconstruct + verify (per-entity live; per-block/per-entry/whole-chain offline) | 06 (live), 09/11 (block + entry + `verifyChain`) |
| R14 external anchoring (settlement + publish cadence + two roots + chaining; **external targets pending**) | 09, 11 (mechanism only) |
| R15 pluggable anchor target + publish policy (file ships; Git / EVM / Solana **future**) | 09, 11 |
| R16 offline verification vs independently-fetched root (**full R16 when external target live**) | 09, 11 (file target) |
| R17/R18 minimal redaction + retain privately (withheld from published bundle) | 08, 09 |
| R19 true erasure + tombstone, still verifies | 06, 08, 09 |
| R20 auditor recomputes commitment / tamper caught (live + offline) | 06, 09 |

---

## 5. What is NOT yet covered (honest gaps)

- **Real signatures — full verified write path.** Real per-thread **P-256** signing + verification
  are wired for **every civic op** — creates (2a) and updates/deletes (2b) — via `prepareAppend` +
  `RecordService.appendSigned` + `identity/*` (suites 10/12/13), gated on a registered platform
  binding, with the nullifier as the authoritative singleton dedupe (mint on create; carried forward
  on singleton update/delete). The **unsigned dev path** (`signature: "unsigned"`, pubkey-equality
  author check) is **retained for dev/seeds**. Production auth/session that drives the signed path
  end-to-end (passkey sessions, the API) is still future.
- **External anchoring (not yet).** Block settlement, publication, offline verify, and a **file**
  `AnchorTarget` are implemented (suites 09/11) — the dev/test primitive. **Still future:** Git
  transparency-log, **EVM** (testnet in dev, production L1/L2 later), and **Solana** connectors
  that publish roots to infra we do not control. Until those ship and are verified, we cannot
  claim R14 “without trusting the platform.” immudb `verifyRow` remains server-side.
- **Offline verifier scope (deferred).** The offline verifier proves **Merkle inclusion + reveal**
  against the anchored root. It does **not** yet re-check each tx's per-entity `prevHash` witness
  (that linkage is verified live in `verifyEntityChain`). A documented follow-up.
- **Concurrency.** The per-entity `prevHash` assumes a single writer per entity (sequential).
  Concurrent writes to the same entity would need optimistic locking — untested.
- **Settlement has no automatic scheduler yet.** Write atomicity is solved (suite 10): the private
  write + commitment enqueue are one Postgres transaction, and `BlockSettler` settles the pool into
  blocks — idempotently and crash-safely, with a healthcheck-gated retry/back-off policy (default
  "3-3-3", env-configurable; `0` = indefinite) — on the count/age trigger. What is still missing is
  an **automatic** invocation of `maybeSettleBlock` / `maybePublish` on a worker or API timer;
  today it is an explicit call. Wiring that trigger is the intended next/API-layer step.
- **Redaction granularity.** Redaction targets a transaction (a revision). Withholding the
  *current* content means redacting the head revision; redacting an older revision withholds
  only that revision. Bulk "redact this entity and all its revisions" is not a single call yet.
- **KYC tiers, sponsorships, geographic filtering** — not in this phase.

---

## 6. Reproduce

```bash
npm install
npm run db:up   --workspace public-record   # immudb 1.11.0 (pg-wire :5443) + postgres 16 (:5442)
npm run test    --workspace public-record   # 78 tests (14 suites)
npm run seed    --workspace public-record   # dev DB: folded state + settle + publish + verify
npm run db:down --workspace public-record   # tear down (wipes volumes)
```
