# public-record — testing report

_First end-to-end exercise of the event-sourced public record. Stack: immudb **1.11.0**
(PostgreSQL wire protocol) + Postgres **16** in Docker; tests in Mocha/Chai (TypeScript via
tsx). **45 tests across 10 suites, all green (~12s).** Signing is stubbed this phase; the
per-entity hash chain, block-close pipeline, file target, offline verifier, and the
transactional outbox are real. **External** anchoring (Git / EVM / Solana) is not yet implemented._

## TL;DR

- **The model works.** Create/edit/delete are append-only transactions; current state is a
  fold over the log; the append-only chain (immudb) holds only commitments while the raw
  content lives in mutable Postgres. All 45 tests pass.
- **Two-store writes are durable (transactional outbox).** The private Postgres write
  **atomically enqueues** the immudb commitment in the same transaction; the relay delivers it
  **idempotently**, and a `flushOutbox()` recovery sweep completes anything left pending. A crash
  between the two stores can no longer orphan a record without its commitment. On a failed relay
  the sweep applies a **healthcheck-gated retry policy** (default "3-3-3", env-configurable; `0` =
  indefinite): retry while immudb is healthy, back off and re-healthcheck while it is down. See
  suite 10.
- **Block anchoring pipeline works (dev).** Incremental blocks close to a **file** target; an
  **offline verifier** checks a single entry or a whole block against a root read from that
  target — no DB/immudb at verify time. See suite 09. **External** anchoring (publishing to
  Git / EVM testnet / production chain) is still future; that is when we can claim verification
  without trusting the platform.
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
PublicChain.append(envelope, {salt, content})
  ├─►  Postgres record_tx   : raw content + salt (erasable) + EXACT canonical envelope
  └─►  immudb  record_chain : commitment row + envelope (NO plaintext)   [append-only]
  ▼
txHash = hashLeaf(canonicalJson(envelope))   → becomes the next same-entity tx's prevHash
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

## 3. Test inventory (10 suites · 45 tests)

| Suite | Tests | What it proves |
|---|---|---|
| 01 create | 3 | roots create; immudb holds commitments only (no plaintext); content in Postgres; `immudb_verify_row` passes; poll/petition carry rules |
| 02 attach | 4 | parent rules (comment→post/petition/poll/comment, reaction→post/comment, signature→petition, vote→poll); reactions rejected on petition/poll; depth ≤ 3; one active vote/signature per author per parent |
| 03 state-fold | 4 | edit folds to new content, history retained; reaction mutual-exclusion (check→cross flips); delete tombstones, history remains; only author/platform may modify |
| 04 governance | 4 | vote change allowed only with `allowChange` + before deadline; rejected when final or expired; signature revoke gated likewise; platform rules update flips forbidden→allowed |
| 05 revision-pinning | 1 | editing a parent keeps support pinned to the original revision; entity-pinned follows, revision-pinned does not transfer |
| 06 chain | 3 | full create→update chain verifies; raw-content tampering in Postgres is detected; true erasure still verifies (hash-only) |
| 07 projections | 3 | `getThread` (nested comments + reaction tallies); poll results by option; active signature counts (minus revoked) |
| 08 redaction | 2 | redaction withholds from responses while retaining raw + chain intact; erasure destroys raw + chain verifies on hashes |
| 09 anchoring | 11 | incremental block close (reproducible roots, on-disk artifacts); bundleMerkleRoot ↔ Merkle over envelopes; immudbRoot captured; append-only target; offline full-block + single-entry verify against an independently-fetched root; block chaining; redacted/erased withheld; seq-range + target-integrity + tamper detection |
| 10 outbox | 8 | atomic enqueue (private write + commitment queued in one Postgres tx); a crash-orphaned write is recovered by an idempotent `flushOutbox()` sweep so the chain verifies; duplicate / pre-delivered commitments never double-write (immudb `PRIMARY KEY` + `getEnvelope` guard); an enqueue failure rolls the private write back (true atomicity); the retry policy retries while healthy, backs off + re-healthchecks while down, gives up after `healthcheckAttempts` (leaving the row pending) and `0` = indefinite |

Run: `npm run db:up --workspace public-record` then `npm run test --workspace public-record`.

---

## 4. Requirement coverage

| Requirement (REQUIREMENTS.md) | Where proven |
|---|---|
| R1 record types + attachment/op rules + depth ≤ 3 | 02 |
| R1 reaction kinds mutually exclusive | 03 |
| R1a governance (vote-change / signature-revoke gating; platform rules update) | 04 |
| R1b dual attachment (entity vs revision pinning) | 05 |
| R4/R5 commitments-only ledger + hiding (salted) | 01, 06 |
| R6 mutable private store (redact/erase real) | 08 |
| R12/R13 reconstruct + verify (per-entity live; per-block/per-entry offline mechanics) | 06 (live), 09 (block + single-entry) |
| R14 external anchoring (block model + two roots + chaining; **external targets pending**) | 09 (mechanism only) |
| R15 pluggable anchor target (file ships; Git / EVM / Solana **future**) | 09 |
| R16 offline verification vs independently-fetched root (**full R16 when external target live**) | 09 (file target) |
| R17/R18 minimal redaction + retain privately (withheld from published bundle) | 08, 09 |
| R19 true erasure + tombstone, still verifies | 06, 08, 09 |
| R20 auditor recomputes commitment / tamper caught (live + offline) | 06, 09 |

---

## 5. What is NOT yet covered (honest gaps)

- **Real signatures.** `authorPubkey`/`signature` are stubs; author-match is pubkey equality.
  No cryptographic signing/verification yet (Turnkey/BIP32 is a later phase). The per-entity
  **hash chain is real**; the **signature layer is not**.
- **External anchoring (not yet).** Block close, bundle export, offline verify, and a **file**
  `AnchorTarget` are implemented (suite 09) — the dev/test primitive. **Still future:** Git
  transparency-log, **EVM** (testnet in dev, production L1/L2 later), and **Solana** connectors
  that publish roots to infra we do not control; a close scheduler (N/day). Until those ship and
  are verified, we cannot claim R14 “without trusting the platform.” `closeBlock` is an explicit
  call today. immudb `verifyRow` remains server-side.
- **Offline verifier scope (deferred).** The offline verifier proves **Merkle inclusion + reveal**
  against the anchored root. It does **not** yet re-check each tx's per-entity `prevHash` witness
  (that linkage is verified live in `verifyEntityChain`). A documented follow-up.
- **Concurrency.** The per-entity `prevHash` assumes a single writer per entity (sequential).
  Concurrent writes to the same entity would need optimistic locking — untested.
- **Outbox relay has no scheduler yet.** Write atomicity is now solved (suite 10): the private
  write + commitment enqueue are one Postgres transaction, and a `flushOutbox()` sweep — with a
  healthcheck-gated retry/back-off policy (default "3-3-3", env-configurable; `0` = indefinite) —
  recovers anything pending after a crash or an immudb outage. What is still missing is an
  **automatic** background trigger for that sweep on a timer; today it is an explicit call (like
  `closeBlock`), plus the best-effort immediate relay on `append`.
- **Redaction granularity.** Redaction targets a transaction (a revision). Withholding the
  *current* content means redacting the head revision; redacting an older revision withholds
  only that revision. Bulk "redact this entity and all its revisions" is not a single call yet.
- **KYC tiers, sponsorships, geographic filtering** — not in this phase.

---

## 6. Reproduce

```bash
npm install
npm run db:up   --workspace public-record   # immudb 1.11.0 (pg-wire :5443) + postgres 16 (:5442)
npm run test    --workspace public-record   # 35 tests
npm run seed    --workspace public-record   # dev DB: folded state + chain-verify summary
npm run db:down --workspace public-record   # tear down (wipes volumes)
```
