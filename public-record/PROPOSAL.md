# Proposal: `@oursay/public-record`

_Status: **Partially implemented** · Graduates from `immudb-test`; **supersedes** the `turnkey-test` spike (identity model revised — see [`../turnkey-test/FINDINGS.md`](../turnkey-test/FINDINGS.md))_

> **Implementation note (event-sourced model).** The initial schema + verification chain are
> built — see [`README.md`](./README.md) and `src/`. The implemented model is **event-sourced**:
> every create/edit/delete is an append-only transaction (`TxEnvelope`) on a **per-entity hash
> chain**, and current state is a **fold** over the log. This refines §3 and §5 below (which
> described an earlier flat, one-row-per-record model): the immudb table is `record_chain`
> (one row per transaction) and the Postgres store is the `record_tx` event log + fold-on-read
> views. The content model is the **7 types** in §5.3 (post, comment, reaction, petition,
> petition_signature, poll, vote) with governance rules + dual (entity/revision) attachment.
> The connector seam (§4), identity (§6), and exports (§7) remain as written. Signing is
> **stubbed** this phase.
>
> **Implementation note (pool → settle → publish).** Anchoring (§8) is now **built**, and the
> as-built flow supersedes §3's per-tx append and §5.1's Postgres `anchors` mirror:
> `append` only **pools** a tx (atomic `record_tx` + `record_outbox` `pending`) — it does NOT
> write the chain. A **block** is settled from the pool by `BlockSettler` when the trigger fires
> (≥ `BLOCK_MAX_PENDING` pending **or** the oldest waited ≥ `BLOCK_MAX_PENDING_AGE_HOURS`, capped
> at `BLOCK_MAX_TXS`): the commitments are batch-appended to `record_chain` and a **block header**
> lands in **`record_blocks` on immudb** — the canonical block tip, keyed by `(chainId, height)`
> so one shared immudb hosts several chains (one per governing body). Block/anchor bookkeeping is
> therefore on the chain, NOT mirrored in Postgres. `AnchorPublisher` then replicates settled
> blocks to each `AnchorTarget` on its own cadence; the offline verifier checks a block / entry /
> whole chain (`verifyChain`) against an independently-fetched root. The block header reserves
> `proposer` + `attestations` for a stage-2 custodian quorum (doc 07 §4). See README + TESTING-REPORT.

This proposal defines the **public record** workspace: the production library that writes
OurSay's verifiable civic record, holds the private data behind it, and ships the tooling to
audit it. It is the `PROPOSAL.md` step described in [`PHILOSOPHY.md`](../docs/PHILOSOPHY.md) §3 —
written before code, citing the findings, so the design can be reviewed in prose.

It defines: the **Postgres module** (private, mutable store), the **immudb module** (public,
append-only ledger), the **schemas** for both, and a **pluggable client connector** layer so
we can serve immudb over gRPC _or_ the Postgres wire protocol — and swap or add transports —
without touching the rest of the system.

**Read first:** [`REQUIREMENTS.md`](./REQUIREMENTS.md) (the normative requirements `R1`–`R28` this must satisfy),
[`../immudb-test/FINDINGS.md`](../immudb-test/FINDINGS.md) (the evidence), and
[`../docs/PHILOSOPHY.md`](../docs/PHILOSOPHY.md) / [`../docs/VALUES.md`](../docs/VALUES.md) (the rules).

---

## 1. Goals

Build the smallest, well-tested library that lets the rest of OurSay:

1. **Append** signed posts, petitions, comments, votes, and reactions to a verifiable
   public record (R1, R2).
2. Do so with **only salted hash commitments + public metadata** on the append-only ledger,
   keeping **raw content and PII in a mutable Postgres store** (R4–R6; Philosophy §5; FINDINGS §1).
3. Let the public **fully audit** the record offline against an **externally-anchored root**
   (R12–R16; FINDINGS §4–§8).
4. Support **per-thread keys** (HKDF-derived on-device from a level master, P-256-signed) that the
   platform can verify belong to a real user via a **private registration binding** **without
   exposing the user**, that the user can later claim or disclaim, and that the user can
   **selectively reveal** per thread (R2, R3, R7–R11; supersedes `turnkey-test`).
5. **Redact or erase** content minimally and integrity-preservingly (R17–R20; FINDINGS §3).
6. Be **transport-pluggable**: the same commitment/envelope model runs over a gRPC connector
   or a pg-wire connector, chosen by config (Values §8; FINDINGS §5).

Non-goals for the first version: production EVM/Solana broadcast wiring (the anchor signer is
abstracted; broadcasting is a thin later step), the KYC provider integrations themselves
(this library stores their _attestations_; the providers live behind their own abstraction),
and any public-facing UI (that is the `site` workspace, which imports this library's read API).

---

## 2. Workspace identity & layout

```
public-record/
├── package.json                # @oursay/public-record, ESM, NodeNext
├── PROPOSAL.md                 # this document
├── README.md                   # usage + architecture picture (added with the code)
├── docker-compose.yml          # immudb 1.11.0 (pg-wire) + immudb 1.1.0 (gRPC, optional) + postgres 16
├── .env.example
├── src/
│   ├── index.ts                # the package public surface (see §7)
│   ├── crypto/
│   │   ├── canonical.ts        # canonical JSON (promoted from immudb-test/commitment.ts)
│   │   ├── commitment.ts       # salted content commitment + domain tags
│   │   └── merkle.ts           # RFC-6962 Merkle tree (promoted as-is)
│   ├── schema/
│   │   ├── envelope.ts         # PublicEnvelope + RecordType + wire version
│   │   ├── postgres.sql.ts     # private-store DDL (see §5.1)
│   │   └── ledger.ts           # ledger row shape for the pg-wire connector (see §5.2)
│   ├── ledger/                 # THE PUBLIC, APPEND-ONLY RECORD (immudb)
│   │   ├── connector.ts        # LedgerConnector interface (the pluggable seam, §4)
│   │   ├── pgwire.connector.ts # immudb 1.11.0 over pg-wire (RECOMMENDED default)
│   │   ├── grpc.connector.ts   # immudb gRPC verified API (optional, watchdog/baseline)
│   │   └── ledger.ts           # PublicLedger: append()/get() over a LedgerConnector
│   ├── private/                # THE PRIVATE, MUTABLE STORE (postgres)
│   │   └── store.ts            # PrivateStore: content, PII, keys, KYC, redact()/erase()
│   ├── identity/               # per-thread keys, bindings & reveal (supersedes turnkey-test)
│   │   ├── derivation.ts       # on-device HKDF per-thread derivation from a level master
│   │   └── binding.ts          # private registration binding + verify + selective reveal + claim
│   ├── anchor/
│   │   ├── anchor.ts           # build the anchor record; AnchorTarget interface
│   │   ├── github.target.ts    # transparency-log target
│   │   └── evm.target.ts       # chain target (anchor tx signed secp256k1; separate from identity)
│   ├── export.ts               # build the publishable audit bundle
│   ├── verifier.ts             # OFFLINE independent auditor (no server, no DB)
│   └── config.ts               # env-driven config with safe local defaults
└── test/                       # property tests mirroring immudb-test suites 01–09
```

**Promotion, not reinvention.** `crypto/*`, `schema/envelope.ts`, `export.ts`, and
`verifier.ts` are promoted from `immudb-test` with minimal change — they are already
transport-agnostic. The new work is the **connector seam** (§4), the **expanded Postgres
schema** (§5.1) for keys/KYC/anchoring, and the **identity** module (§6).

`package.json` (proposed):

```jsonc
{
  "name": "@oursay/public-record",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "OurSay public verifiable record: append-only commitments (immudb) + private mutable store (Postgres), pluggable ledger transport, external anchoring, offline audit.",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down -v",
    "test": "mocha",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@noble/hashes": "^1.7.1",     // HKDF per-thread derivation + commitments
    "@noble/curves": "^1.8.1",     // P-256 envelope signatures (passkey-native)
    "pg": "^8.13.1",
    "dotenv": "^16.4.7"
  }
}
```

> Note: `@oursay/public-record` does **not** depend on the dead `immudb-node` gRPC SDK by
> default. The recommended pg-wire connector uses `pg`. The optional gRPC connector is the
> one place we would vendor/pin a gRPC client, and only as a live-watchdog add-on — see §4.3
> and FINDINGS §5.

---

## 3. Architecture

```
        PUBLIC, append-only (immudb)                  PRIVATE, mutable (Postgres)
        ───────────────────────────                   ───────────────────────────
 append ─► post:<id>     → { …, contentHash }   <-->   raw_content(id, salt, content, redacted_at, erased_at)
          petition:<id>  → { …, contentHash }          users(id, …)            ← PII
          comment:<id>   → { …, contentHash }          level_master_keys(user_id, level, master_pubkey, …)
          vote:<id>      → { …, contentHash }          thread_keys(user_id, thread_id, level, pubkey, claimed)
          reaction:<id>  → { …, contentHash }          thread_bindings(thread_pubkey, …, commitment, salt_t_enc) ← private
                 │                                      kyc_attestations(user_id, provider, tier, sig, …)
                 │                                      sponsorships(…)
                 │ immudb_state() root                          │  redact() / erase()
                 ▼                                              ▼
        export bundle (envelopes + Merkle proofs) ── anchor (transparency log + chain)
                 │
                 ▼
        offline independent verifier   (trusts only the externally-anchored root)
```

Two stores, one boundary, enforced by Philosophy §5:

- **immudb (public ledger)** holds the `PublicEnvelope` — a canonical-JSON commitment to
  content plus public metadata (type, id, parent thread, public signing key ref, timestamp,
  `contentHash`). **Never** plaintext, **never** PII. Append-only is a feature here.
- **Postgres (private store)** holds everything mutable and sensitive: raw content + salt,
  user PII, level-scoped master pubkeys, per-thread keys, the **private thread bindings**
  (with the opaque commitment and its encrypted `salt_t`), KYC attestations, sponsorships, and the
  **settlement pool** (`record_outbox`). Block/anchor bookkeeping is NOT mirrored here — the
  canonical block tip lives on immudb (`record_blocks`). Mutable so `redact()`/`erase()` are real.

The **trust root is the externally-anchored Merkle root + the offline verifier** (Values §1–2),
not immudb itself and not whichever connector we use.

### Append flow (what `PublicLedger.append()` does)

1. User signs the action with their **per-thread key** (HKDF-derived on-device from a level
   master; see §6) — a **P-256** signature, not the passkey itself (the passkey authenticates the
   session and optionally unlocks derivation material). The signature + `thread_pubkey` are part of
   the public envelope; the public envelope carries **`thread_pubkey` only — never the commitment**.
   For a **verified-tier** append the thread key MUST already be registered: at registration the
   platform signed a **private binding** linking the key to one account commitment (§6), so the
   platform can confirm it belongs to a verified user **without recording who**. (Unverified,
   authenticated participation stays **off-record** per the contributor spec — it is not written to
   the public verified record.)
2. Generate a fresh 32-byte **salt**; compute `contentHash = commitment(id, salt, content)`.
3. Write `{ salt, content }` + the exact envelope → **Postgres** `record_tx` (erasable) AND
   atomically enqueue the commitment in `record_outbox` (`pending`), in ONE transaction.
4. Return the id, key, envelope, and salt to the caller. **The chain is not touched here** —
   the commitment reaches **immudb** only when a block is **settled** from the pool (see the
   pool→settle→publish note above and §8). Settlement, not `append`, is the sole chain writer.

This generalizes the `immudb-test` `Ledger.append()` flow to (a) carry the per-thread signature,
(b) write through a connector rather than a hardcoded client, and (c) **defer the chain write to
block settlement** so immudb receives agreed blocks, not one row per action.

---

## 4. The client connector layer (the key seam)

The explicit requirement: **offer both gRPC and pg connectors in the future** without
reworking everything above them. FINDINGS §5 is decisive here:

- The **architecture is version- and transport-independent** — commitments + external Merkle
  anchoring + private store do not depend on immudb's internal proof wire format.
- The **recommended production transport is immudb 1.11.0 over the Postgres wire protocol**
  with a maintained `pg` client (server-side `immudb_state()` / `immudb_verify_row()`).
- The **gRPC verified API** adds operator-independent, client-side, real-time tamper
  detection (a watchdog between anchor points) but the Node SDK is dead and only verifies
  against immudb ≤ 1.1.x — so it is an **optional** connector, not the default.

So we put an interface between `PublicLedger` and immudb. Everything above the interface
(append, export, verify, anchor) is connector-agnostic.

### 4.1 The interface

```ts
// src/ledger/connector.ts
export interface LedgerRoot {
  db: string;
  txId: number;
  txHashHex: string;   // the anchorable root
  serverUuid?: string; // gRPC trusted-state slot; absent for pg-wire
}

export interface RowVerification {
  verified: boolean;
  txId: number;
  revision: number;
  /** 'server' = verdict computed server-side (pg-wire); 'client' = proof recomputed locally (gRPC). */
  provenance: "server" | "client";
}

/** A pluggable transport to the append-only immudb ledger. */
export interface LedgerConnector {
  connect(): Promise<void>;
  close(): Promise<void>;

  /** Append a canonical envelope under key "<type>:<id>". Append-only. */
  put(key: string, canonicalEnvelope: string): Promise<void>;

  /** Read back the canonical envelope for a key (undefined if absent). */
  get(key: string): Promise<string | undefined>;

  /** immudb's current cryptographic root — the value we anchor externally. */
  state(): Promise<LedgerRoot>;

  /** Per-row verification. provenance tells the caller HOW MUCH it proves (see §4.4). */
  verifyRow(key: string): Promise<RowVerification>;

  readonly transport: "pgwire" | "grpc";
}
```

`PublicLedger`, `export.ts`, and `anchor.ts` consume only this interface. `verifier.ts`
consumes **neither** — it is offline and takes a published bundle + an independently fetched
anchored root (Values §1).

### 4.2 `PgWireLedgerConnector` (default)

Wraps `immudb-test/src/immudb-pg.ts`, promoted. Uses `pg` against immudb 1.11.0; `put` is a
parameterized `INSERT`; `get`/`verifyRow` use **literal** WHERE/args (the pg-wire quirks in
FINDINGS §5a: no `rowCount` on SELECT, params don't bind as function args, stale portal
reuse). `state()` → `SELECT immudb_state()`. `verifyRow()` → `immudb_verify_row(...)` with
`provenance: "server"`.

Ledger SQL schema (immudb side) — see §5.2.

### 4.3 `GrpcLedgerConnector` (optional, watchdog/baseline)

Wraps the immudb gRPC verified API. `put`/`get` map to `verifiedSet`/`verifiedGet`;
`state()` reads the locally-persisted trusted root; `verifyRow()` returns
`provenance: "client"` because the proof is recomputed locally against an
independently-held root. Pinned to immudb ≤ 1.1.x per FINDINGS. **Not** the default and
**not** required to ship v1; the interface exists so it can be added without disruption, and
run as a continuous self-check beside the pg-wire writer (FINDINGS §5b "independent auditor").

### 4.4 Why `provenance` is on the result, and why anchoring is still required

`RowVerification.provenance` makes the trust difference explicit at the type level: a
`"server"` verdict is computed inside immudb (a compromised server could lie); a `"client"`
verdict is recomputed from raw proof material against a root we hold. **Neither replaces
anchoring.** Client-side proofs only prove consistency relative to a root you already hold —
they do not establish provenance (an operator who forks from genesis passes every gRPC
proof) and do not give outside auditors anything. The externally-anchored root + offline
verifier is the trust root regardless of connector (FINDINGS §5b; Values §2). Connectors are
defense-in-depth; the anchor is the foundation.

---

## 5. Schemas

### 5.1 Postgres (private, mutable store)

DDL lives in `src/schema/postgres.sql.ts`. The `immudb-test` tables (`users`, `keys`,
`raw_content`) are the seed; this proposal expands them to cover per-thread keys, the
**level-scoped master + private per-thread binding** model (§6), KYC attestations, sponsorships,
and local anchor bookkeeping.

```sql
-- Users (PII). Minimal here; KYC details normalized out.
CREATE TABLE users (
  id          UUID PRIMARY KEY,
  handle      TEXT,                        -- optional public display name
  email_enc   BYTEA,                       -- encrypted at rest
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Level-scoped master public keys. ONE master per governmental level (municipal, provincial,
-- federal, …) so activity in one level cannot be linked to another (compartmentalization;
-- privacy review §3a). Per-thread keys are HKDF-derived on-device from the matching level master;
-- the platform stores only the PUBLIC master, never private/derivation material. Custody is the
-- user's device/passkey; Turnkey is an OPTIONAL recovery path only (VALUES §3).
CREATE TABLE level_master_keys (
  user_id       UUID NOT NULL REFERENCES users(id),
  level         TEXT NOT NULL,             -- governmental level, e.g. 'municipal' | 'provincial' | 'federal'
  master_pubkey TEXT NOT NULL,             -- public level master (P-256); root for on-device HKDF derivation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);

-- Per-thread derived keys. The public key is how a thread action is signed (P-256);
-- the platform can prove (user_id ↔ thread pubkey) privately via the binding below,
-- without exposing user_id. NO commitment and NO derivation path live here or on the envelope.
CREATE TABLE thread_keys (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id),
  thread_id     TEXT NOT NULL,             -- content thread this key is scoped to
  level         TEXT NOT NULL,             -- governmental level this thread belongs to
  pubkey        TEXT NOT NULL,             -- public; appears in the envelope as the author ref
  claimed       BOOLEAN NOT NULL DEFAULT false,  -- user has publicly claimed this thread (R8)
  claimed_at    TIMESTAMPTZ,              -- nullable; claim may be undone (R9)
  UNIQUE (user_id, thread_id)
);
CREATE INDEX ON thread_keys (pubkey);

-- Private per-thread registration binding (PII; NEVER published by default). Created BEFORE a
-- verified-tier append (R7). The platform signs a binding that commits the thread key to ONE
-- opaque account commitment; selective reveal (R11) opens it for chosen threads only.
CREATE TABLE thread_bindings (
  thread_pubkey TEXT PRIMARY KEY REFERENCES thread_keys(pubkey),
  thread_id     TEXT NOT NULL,
  level         TEXT NOT NULL,
  kyc_tier      TEXT NOT NULL,             -- tier at registration (identity/residency/official/electoral)
  region        TEXT,                      -- region metadata at registration
  commitment    BYTEA NOT NULL,            -- opaque H(user_id, salt_t, thread_id, level)
  salt_t_enc    BYTEA NOT NULL,            -- per-thread salt, client-generated, encrypted at rest; opened only on reveal
  binding_sig   BYTEA NOT NULL,            -- platform signature over the fields above (verifiable vs published platform key)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw content behind each commitment. Erasable (redaction / RTBF). FINDINGS §1, §3.
CREATE TABLE raw_content (
  id          UUID PRIMARY KEY,            -- matches PublicEnvelope.id / immudb key suffix
  salt        BYTEA,                       -- 32-byte blinding factor (NULL after erasure)
  content     JSONB,                       -- raw plaintext/structured (NULL after erasure)
  redacted_at TIMESTAMPTZ,                 -- set => withhold from public export, retain here
  erased_at   TIMESTAMPTZ                  -- set => content+salt destroyed, tombstone remains
);

-- KYC attestations. Pluggable, multi-provider (spec §5; VALUES §8). Stores the
-- provider's signed attestation so verification is itself auditable / re-attestable.
CREATE TABLE kyc_attestations (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  provider        TEXT NOT NULL,           -- e.g. 'equifax-connect'
  tier            TEXT NOT NULL,           -- maps to verification tier (spec §4)
  region          TEXT,                    -- jurisdiction context
  attestation_sig BYTEA,                   -- provider signature, where available (future: stronger trust)
  attested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

-- Sponsorships (spec §5.6). Public ledger may carry the sponsorship hash; PII stays here.
CREATE TABLE sponsorships (
  id           UUID PRIMARY KEY,
  sponsor_id   UUID REFERENCES users(id),  -- NULL when sponsor is anonymous
  beneficiary  UUID NOT NULL REFERENCES users(id),
  anonymous    BOOLEAN NOT NULL DEFAULT false,
  outcome      TEXT,                        -- pending | verified | not_passed | declined
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE (as-built): there is NO Postgres `anchors` mirror table. Block/anchor bookkeeping is the
-- block header on immudb (`record_blocks`: height, seq range, bundleMerkleRoot, chainTipHash,
-- immudbRoot, prev links, proposer/attestations), keyed by (chain_id, block_height). The pool to
-- settle from is `record_outbox` (above). "Which txs are in block N" is derived from the header's
-- (from_seq, to_seq] range via record_tx — no mutable Postgres block index. (This supersedes the
-- earlier `anchors` table sketch.)
```

`PrivateStore` exposes typed methods over these: `appendTxAndEnqueue` (pool a tx), the settlement
pool reads (`getPendingForSettlement`, `getPendingPoolStats`, `markOutboxSentBatch`), `redact`,
`erase` (promoted from `immudb-test`), plus `putUser`/`putThreadKey` and the fold-on-read queries;
identity/KYC/sponsorship methods (`putLevelMaster`, `registerThreadBinding`, `putAttestation`,
`putSponsorship`) are forward-looking. Encryption of `thread_bindings.salt_t_enc`/`email_enc` uses a
KMS-managed key (Values §9: the key is never committed; see §8 open question on key management).

### 5.2 immudb ledger row (pg-wire connector)

Mirrors `immudb-test/src/immudb-pg.ts`, with the five OurSay types and the public signing
fields added. immudb speaks the pg wire but not the full dialect — raw SQL only (FINDINGS §5a).

```sql
CREATE TABLE IF NOT EXISTS public_ledger (
  id            VARCHAR[64],     -- UUID
  type          VARCHAR[16],     -- post | petition | comment | vote | reaction
  parent_id     VARCHAR[64],     -- parent thread (e.g. comment→content, vote→poll)
  author_pubkey VARCHAR[128],    -- per-thread public key (pseudonymous, public)
  signature     VARCHAR[256],    -- signature over the canonical envelope
  created_at    VARCHAR[32],     -- ISO 8601
  content_hash  VARCHAR[64],     -- salted commitment (hex)
  envelope      VARCHAR[8192],   -- full canonical-JSON envelope (the verified value)
  PRIMARY KEY (id)
);
```

For the gRPC connector the same envelope is stored as a key-value entry under
`"<type>:<id>"` — both connectors carry the identical `PublicEnvelope`, which is what keeps
`export`/`verifier` connector-agnostic.

### 5.3 The transaction envelope (implemented, event-sourced)

The unit appended to the chain is a **transaction**, not a record. See `src/schema/types.ts`:

```ts
export type RecordType =
  | "post" | "comment" | "reaction"
  | "petition" | "petition_signature"
  | "poll" | "vote";
export type Op = "create" | "update" | "delete";

export interface TxEnvelope {
  v: 1;
  txId: string;                // unique per transaction (the chain's primary key)
  type: RecordType;
  entityId: string;            // stable across the entity's lifecycle
  op: Op;
  parentType?: RecordType;
  parentId?: string;           // ENTITY-level parent (follows edits)
  parentRevisionTxId?: string; // REVISION-level: the parent's head tx …
  parentRevisionHash?: string; // … its content-addressed revision id (parent txHash)
  authorPubkey: string;        // stubbed this phase
  signature: string;           // stubbed this phase
  createdAt: string;           // ISO 8601
  prevHash: string | null;     // per-entity chain link = prior tx's txHash for entityId
  contentHash: string;         // salted commitment — NEVER the plaintext
}
// txHash = hashLeaf(canonicalJson(envelope)); the next same-entity tx sets prevHash = txHash
```

> **Types.** `post` is the generic primitive the product surfaces as a "Belief". A `poll` is the
> question/container (legally safer than "referendum"); a `vote` is the cast ballot on a poll; a
> `petition_signature` is a signature on a petition. Votes/signatures are **final by default**,
> changeable/revocable only when the parent's governance `rules` + `deadline` permit (see
> `governance.ts`). Comments/reactions carry **dual attachment** (entity + revision). A closed
> poll's **`result`** is a derived/published record (a later phase), not a user append. The set
> is **config-extensible** — candidate future types: `discussion`, `bill`, `official_response`.

---

## 6. Identity: per-thread keys, bindings, and selective reveal (supersedes `turnkey-test`)

The requirements: per-thread keys (R2, R3); the platform proves a key belongs to a verified
user **without exposing the user** (R7); the user may stay anonymous or **claim** a thread
reversibly (R8, R9); an independent org can verify a user's thread activity once the user
authorizes it (R11).

> The earlier `turnkey-test` spike explored BIP32/xpub derivation with remote Turnkey custody.
> That model was **not adopted** — see [`../turnkey-test/FINDINGS.md`](../turnkey-test/FINDINGS.md).
> The decisive problem: ownership proof via **xpub** is all-or-nothing — sharing one xpub exposes
> **every** thread under it (a level-scoped xpub only limits the blast radius to a whole level,
> never to an individual thread). A civic record needs **per-thread** selective disclosure.

### Keys and custody

- **Passkeys** handle **account authentication** (WebAuthn), and optionally — via PRF / secure
  device storage — **unlock** the user's derivation material. A passkey does **not** sign each
  civic action and does **not** itself contain the derivation secret.
- Each user holds a **level-scoped master key per governmental level** (municipal, provincial,
  federal, …). Separate masters are the **structural compartmentalization** mechanism (privacy
  review §3a): activity under one level cannot be linked to another.
- **Per-thread keys** are derived **deterministically on-device** from the matching level master
  via **HKDF** (domain-separated by `thread_id` + `level`) — not BIP32 paths. The platform stores
  only the **public** master (`level_master_keys`) and the **public** thread key
  (`thread_keys.pubkey`); never private or derivation material.
- Each action's envelope is signed by the **HKDF-derived per-thread key** using **P-256** (the one
  canonical envelope algorithm). Turnkey, if used at all, is an **optional recovery** path only.

### The three-layer trust model

Authorship, linkage, and the published set are three **separate** proofs:

1. **User action signature** — proves *authorship* under a thread key: a P-256 signature in the
   envelope, checkable by anyone against `thread_pubkey`. Trustless.
2. **Platform registration binding** — proves the *platform linked that thread key to one account
   commitment* at registration time (required before any verified-tier append). The binding is
   **private** and signed by the platform over
   `thread_pubkey, thread_id, level, kyc_tier, region, commitment`, where the per-thread
   **commitment** is `H(user_id, salt_t, thread_id, level)`. `salt_t` is **unique per thread,
   client-generated at registration, stored encrypted at rest, and never published** until a
   reveal. The commitment is **opaque** and lives **only in this private binding** — it is **not**
   on the public envelope.
3. **Settlement attestation** — proves the *published verified set*: at settlement the platform
   signs over the block's **Merkle root plus per-envelope metadata**, referencing bindings by
   `thread_pubkey` and including each **opaque commitment** as metadata in the signed set (not a
   vague "verified account" flag).

What this buys: the public record shows only `thread_pubkey`, the action signature, tier/region
metadata, and (via the attestation) an opaque commitment — **never `user_id`, never cross-thread
linkability**. The linkage gap shrinks from "trust our database" to "verify our signed bindings."

### Module (`src/identity/*` — implemented; full verified write path)

**Implemented** (promoted from `passkey-test`; suites `10-identity-crypto`, `12-signed-append`,
`13-signed-ops`):

- **`derive.ts`** — `deriveThreadKey({ levelMaster, threadId, level })` / `deriveThreadPrivateKey`
  / `threadDomainInfo`: on-device HKDF→P-256 derivation, domain-separated by `(thread_id, level)`,
  with a pinned scalar mapping. No private material leaves the device.
- **`envelope.ts`** — `signEnvelope(env, privKey)` / `verifyEnvelope(env)` (+ `UNSIGNED`): P-256
  signing/verification over the **signing digest** (`signature=""`), with the leaf computed via the
  reused `txHashOf`.
- **`binding.ts`** — `buildThreadBindingInputs(...)`: the client-side `{ binding, opening }` inputs.
- **`platform-binding.ts`** — `signBinding(binding, platformPriv)` / `verifyBinding(...)` /
  `platformPublicKey(...)`: the platform signs/verifies the registration binding. The platform key
  is **env-required** (`PLATFORM_BINDING_PRIVKEY`); tests use an ephemeral key. (KMS is a later
  milestone.)
- **`verify.ts`** — `verifyThreadBinding(store, threadPubkey, platformPubKeyHex)`: confirms a
  `thread_pubkey` is registered **without exposing which user**, and **re-verifies** the stored
  `binding_sig` (defense-in-depth).
- `threadCommitment(...)` lives in **`crypto/commitment.js`** (the opaque
  `H(user_id, salt_t, thread_id, level)`).
- The verified-tier gate is **`RecordService.appendSigned({ envelope, salt, content })`**, fed by
  **`prepareAppend(intent)`** (the server-derived fields the client must sign over). It covers
  **all civic ops**:
  - **2a — creates** (post/poll/petition + comment/reaction/vote/petition_signature): verifies the
    signature + binding + `contentHash`, content-model rules (shared `validateCreate`), thread-scope,
    parent-revision concurrency, and the **nullifier gate**. A **platform-attested nullifier**
    (`H(level-secret, parentId)`, scoped to the **singleton parent** — poll/petition for vote/
    signature, the immediate post/comment for a reaction) is the authoritative one-per-`(user,parent)`
    dedupe — minted + signed on the **create** only; tallies dedupe by nullifier.
  - **2b — updates/deletes** (edits, vote-change, signature-revoke, deletes): shared
    `validateUpdate`/`validateDelete` (op rules + governance via `canChangeVote`/`canRevokeSignature`);
    **author-match is cryptographic** (`verifyEnvelope` proves control of `authorPubkey`, which must
    equal the entity's author); **optimistic concurrency** rejects a stale `prevHash` or a moved
    parent/parent-revision (reject-and-retry); singleton update/delete **carry the original
    nullifier forward** (no re-mint, no dup-check); a `delete` must carry `DELETE_MARKER`.
- **Freshness gate (all signed ops):** `appendSigned` rejects an envelope whose `createdAt` is older
  than `SIGNED_ENVELOPE_MAX_AGE_SEC` (default 120; `0` disables) or more than the allowed future skew
  ahead of the server clock — using the already-signed `createdAt` (no schema/wire change; clients set
  it at sign time). The clock is injectable for tests.
- The platform stores only the **public** master (`level_master_keys`), the **public** thread key
  (`thread_keys.pubkey`), and the private `thread_bindings` / `nullifier_attestations`.
- The **unsigned dev path** (`create/update/delete/react/vote`) is retained for dev/seeds and now
  shares the same `validateCreate`/`validateUpdate`/`validateDelete` validators.

**Still future (NOT implemented):**

- *Selective reveal (R11):* `revealThread(thread_pubkey)` — publish the opening
  `(user_id, salt_t, thread_id, level)` + binding for chosen threads so an independent org recomputes
  the commitment and binds it to identity via its own KYC.
- *Claim / unclaim (R8, R9):* flip `thread_keys.claimed` (+ optional public claim record) — the
  user-controlled pseudonymous-ownership channel, distinct from the reveal channel.
- *User-signed binding (strengthens R11):* the binding additionally signed by the **user**, so an
  auditor verifies ownership **without platform cooperation**.
- At-rest encryption of `salt_t`/openings (the path keeps `salt_t` client-held; KMS milestone), the
  HTTP API, passkey sessions, and full KYC provider integration.

The binding, `salt_t`, and commitment openings are **PII, never published** except on the user's
explicit per-thread authorization (Values §3); at-rest encryption is the KMS milestone. This module
never writes private key material anywhere; signing keys stay on the user's device.

---

## 7. Public surface (`src/index.ts` exports)

What product workspaces and audit tooling import. Deliberately small; internals stay internal
(Philosophy §2.3).

Mirrors the actual `src/index.ts` (abbreviated to the load-bearing names):

```ts
// Orchestrator
export { RecordService } from "./record.js";          // incl. appendSigned (verified-tier gate)
export type { Ref } from "./record.js";

// Stores & chain
export { PrivateStore, toPublicView } from "./private/store.js";
export type { EntityState, PublicEntityView, StoredTx, AppendTxInput, ThreadBindingRow } from "./private/store.js";
export { PublicChain, txHashOf } from "./ledger/chain.js";

// Connectors (pluggable transport; pg-wire default)
export { PgWireLedgerConnector } from "./ledger/pgwire.connector.js";
export type { LedgerConnector, LedgerRoot, RowVerification, ChainRow, BlockHeader } from "./ledger/connector.js";

// Settlement + anchoring (assembler / publisher / file target / target policy / types)
export { BlockSettler } from "./ledger/settler.js";
export { BundleAssembler } from "./anchor/assembler.js";
export { AnchorPublisher } from "./anchor/publisher.js";
export { FileAnchorTarget } from "./anchor/file.target.js";
export { everyNBlocks } from "./anchor/target.js";
export type { AnchorTarget, AnchorRecord, BlockBundle } from "./anchor/types.js";

// Verification — live (against immudb) + OFFLINE (no DB / no platform)
export { verifyEntityChain } from "./verify.js";
export { verifyEntry, verifyBlock, verifyChainLink, verifyChain, computeChainTipHash } from "./anchor/verify.js";

// Shared crypto (also what independent auditors reimplement against)
export { canonicalJson, contentCommitment, newSalt, sha256Hex, threadCommitment } from "./crypto/commitment.js";
export { hashLeaf, merkleRoot, merkleProof, verifyMerkleProof } from "./crypto/merkle.js";

// Identity (Track A slice) — also re-exported via the "./identity/*" subpaths
export { deriveThreadKey, deriveThreadPrivateKey, threadDomainInfo } from "./identity/derive.js";
export { signEnvelope, verifyEnvelope, UNSIGNED } from "./identity/envelope.js";
export { buildThreadBindingInputs } from "./identity/binding.js";
export { signBinding, verifyBinding, bindingDigest, platformPublicKey } from "./identity/platform-binding.js";
export { verifyThreadBinding, bindingFromRow } from "./identity/verify.js";

// Schema + config
export type { RecordType, Op, EntityRules, TxEnvelope /* + content types */ } from "./schema/types.js";
export { immudbPgConfig, pgConfig, outboxConfig, chainConfig, blockConfig, anchorTargetsConfig } from "./config.js";
```

> Note: `config.ts` also defines `identityConfig` (`PLATFORM_BINDING_PRIVKEY`); it is read internally
> by the server identity path and is **not** part of the public `index.ts` surface.

The **`verifyBundle` + crypto exports are the documented audit surface**: an outside party
can either import them or reimplement them from the documented schemas, and verify the
published record with no server access (Values §1; spec §11.3, §12.3).

---

## 8. Anchoring, blocks, and cadence

Per REQUIREMENTS.md R14–R16 and FINDINGS §4:

- Accumulate pooled appends into a **block**; **settle on the trigger** — at **N actions**
  (`BLOCK_MAX_PENDING`, default 250) **or** when the oldest pending tx has waited X
  (`BLOCK_MAX_PENDING_AGE_HOURS`, default 12h), whichever comes first, capped at `BLOCK_MAX_TXS`.
  Settlement batch-appends the commitments to `record_chain` and writes the block header to
  `record_blocks` (height, `bundleMerkleRoot`, `chainTipHash`, immudb root, prev links). Publishing
  the bundle to external targets is a **separate per-target cadence** (`AnchorPublisher`).
- **Pluggable targets behind `AnchorTarget`** (R15; Values §8), supporting more than one
  simultaneously: a **transparency log** (GitHub `anchors.jsonl` + tag — cheap, human-auditable)
  and a **chain** (`anchor(bytes32)` of the bundle root). The chain-target transaction is signed
  with **secp256k1** because that is the EVM chain's native curve — this is the **platform→chain
  anchor tx**, an entirely separate concern from the **P-256 user-action envelopes** (§6); the two
  layers do not share keys or algorithms. Broadcasting is the one thin step left for a follow-up.
- The action → block → anchor link for self-audit (spec §11.4) is derived from the block header's
  seq range on immudb (`record_blocks`), not a Postgres mirror.

> **Spec reconciliation — resolved.** Contributor spec §3.4 and §11 now describe this model
> directly: immudb is the off-chain verifiable record, the chain is only a **pluggable anchor
> target**, and the **preferred primary anchor is Ethereum** (most decentralized), with a
> transparency log (GitHub) as a low-cost complement and EVM L2 / Solana available as
> alternatives. Solana (originally considered for a delivery partnership) is now one optional
> target rather than "the ledger." The anchor-tx curve (secp256k1) is the chain target's, not the
> user identity layer's (which is P-256; §6). Remaining sub-decision (L1 vs an EVM L2) is open
> question #1.

---

## 9. Open questions for review

1. **Primary anchor chain.** Direction set and reflected in spec §3.4/§11: **Ethereum
   preferred** (R15), pluggable, with a GitHub transparency log as a complement; Solana
   de-scoped from "the ledger" to one optional target. Remaining: confirm **L1 vs an EVM L2**
   for cost/latency before the anchoring phase.
2. **At-rest encryption key management** for `thread_bindings.salt_t_enc` / commitment openings /
   `email_enc` — KMS choice (GCP/AWS per spec §3.1), rotation, and who can decrypt. Must satisfy
   "no secrets in git" (Values §9).
3. **gRPC connector in v1 or later?** Recommendation: ship pg-wire only in v1; add the gRPC
   watchdog connector once the live self-check is worth operating (FINDINGS §5b).
4. **Signature scheme on the envelope** — **resolved: P-256** (passkey-native), the single
   canonical envelope algorithm; secp256k1 is retained only for the platform→EVM anchor tx (§8).
   Affects `author_pubkey`/`signature` sizing in §5.2.
5. **Selective reveal & user-signed bindings** — confirm whether the registration binding is
   platform-signed only (MVP) or additionally user-signed (the R11 path needing no platform
   cooperation; §6). Also: does **claiming** a thread publish a record to the ledger, or only flip
   a private flag surfaced in the read API? Affects anonymity-set reasoning (Values §3).
6. **Block size N and fallback interval** — confirm the production target and the dev default.

---

## 10. Phasing

**Phase 1 — Core verifiable record (MVP).** Promote `crypto/*`, `schema/envelope`,
`export`, `verifier`. Build `PgWireLedgerConnector`, `PublicLedger`, expanded `PrivateStore`
(content + redact/erase + users/keys). Property tests mirroring immudb-test 01–06, 09.
Outcome: signed appends, commitments-only ledger, offline audit — over the recommended
transport.

**Phase 2 — Identity & ownership.** **(built — full verified write path).** **Done:** `identity/*`
(on-device HKDF per-thread derivation, P-256 envelope signing, client binding inputs, platform
`signBinding`/`verifyBinding` + nullifier attestation, `verifyThreadBinding` with `binding_sig`
re-verify, `nullifier.ts`); `threadCommitment` in `crypto/commitment`; `prepareAppend` +
`RecordService.appendSigned` covering **all civic ops** — **2a creates** (post/poll/petition +
comment/reaction/vote/petition_signature) with the platform-attested per-`(user,parent)` nullifier as
the authoritative dedupe, and **2b updates/deletes** (edits, vote-change, signature-revoke, deletes)
with cryptographic author-match, optimistic concurrency, and nullifier carry-forward; shared
`validateCreate`/`validateUpdate`/`validateDelete` used by both signed + unsigned paths. Schema
(`level_master_keys`, `thread_keys`, `thread_bindings`, `nullifier_attestations`, `kyc_attestations`
stub, `record_tx.nullifier`). Suites `10-identity-crypto`, `12-signed-append`, `13-signed-ops`.
**Remaining:** the HTTP API (`@oursay/api`), passkey **sessions** + registration UX, full **KYC**
provider, **claim/unclaim** (R8/R9), **selective reveal** / **user-signed bindings** (R11), at-rest
PII/KMS encryption (`salt_t` stays client-held), and the sponsorships table.

**Phase 3 — Settlement & anchoring.** **(built, dev)** `BlockSettler` (pool → `record_chain` +
`record_blocks` on the count/age trigger) + `AnchorPublisher` with the file target on a per-target
cadence; chain-scoped by `chainId`; offline block / entry / whole-chain verification against an
externally-fetched root. **Still future:** GitHub + EVM/Solana targets.

**Phase 4 — Watchdog (optional).** `GrpcLedgerConnector` as a continuous independent
auditor beside the pg-wire writer (FINDINGS §5b).

Each phase ends with passing property tests that assert the security properties, not just
behavior (Values §10).

---

_Approve, amend, or push back on the open questions in §9 before code begins, per
[`PHILOSOPHY.md`](../docs/PHILOSOPHY.md) §3._
