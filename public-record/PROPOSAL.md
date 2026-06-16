# Proposal: `@oursay/public-record`

_Status: **Partially implemented** · Graduates from `immudb-test` and `turnkey-test`_

> **Implementation note (event-sourced model).** The initial schema + verification chain are
> built — see [`README.md`](./README.md) and `src/`. The implemented model is **event-sourced**:
> every create/edit/delete is an append-only transaction (`TxEnvelope`) on a **per-entity hash
> chain**, and current state is a **fold** over the log. This refines §3 and §5 below (which
> described an earlier flat, one-row-per-record model): the immudb table is `record_chain`
> (one row per transaction) and the Postgres store is the `record_tx` event log + fold-on-read
> views. The content model is the **7 types** in §5.3 (post, comment, reaction, petition,
> petition_signature, poll, vote) with governance rules + dual (entity/revision) attachment.
> The connector seam (§4), identity (§6), exports (§7), and anchoring (§8) remain as written —
> forward-looking. Signing is **stubbed** this phase.

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
4. Support **per-thread keys** that the platform can verify belong to a real user **without
   exposing the user**, and that the user can later claim or disclaim (R2, R3, R7–R11;
   graduates from `turnkey-test`).
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
│   ├── identity/               # per-thread keys & ownership (graduates from turnkey-test)
│   │   ├── derivation.ts       # BIP32 thread paths, xpub handling
│   │   └── ownership.ts        # prove a per-thread key belongs to a user, without exposing them
│   ├── anchor/
│   │   ├── anchor.ts           # build the anchor record; AnchorTarget interface
│   │   ├── github.target.ts    # transparency-log target
│   │   └── evm.target.ts       # chain target (signing delegated to @oursay turnkey layer)
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
    "@noble/hashes": "^1.7.1",
    "@noble/curves": "^1.8.1",
    "@scure/bip32": "^1.x",        // xpub/thread-key derivation & verification
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
          comment:<id>   → { …, contentHash }          account_keys(user_id, xpub_enc, …)  ← PII, encrypted
          vote:<id>      → { …, contentHash }          thread_keys(user_id, thread_id, pubkey, path, claimed)
          reaction:<id>  → { …, contentHash }          kyc_attestations(user_id, provider, tier, sig, …)
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
  user PII, account xpub (encrypted), per-thread keys, KYC attestations, sponsorships, and
  our local mirror of block/anchor bookkeeping. Mutable so `redact()` and `erase()` are real.

The **trust root is the externally-anchored Merkle root + the offline verifier** (Values §1–2),
not immudb itself and not whichever connector we use.

### Append flow (what `PublicLedger.append()` does)

1. User signs the action with their **per-thread key** (provisioned via the identity module).
   The signature + public key are part of the public envelope; the platform first checks the
   thread key belongs to a verified user (§6) **without recording who**.
2. Generate a fresh 32-byte **salt**; compute `contentHash = commitment(id, salt, content)`.
3. Write `{ salt, content }` → **Postgres** `raw_content` (erasable).
4. Write the `PublicEnvelope` (commitment + metadata + signature) → **immudb** via the
   configured `LedgerConnector` (append-only).
5. Return the id, key, envelope, and salt to the caller.

This is exactly the `immudb-test` `Ledger.append()` flow, generalized to (a) carry the
per-thread signature and (b) write through a connector rather than a hardcoded client.

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
xpub-as-PII model, KYC attestations, sponsorships, and local anchor bookkeeping.

```sql
-- Users (PII). Minimal here; KYC details normalized out.
CREATE TABLE users (
  id          UUID PRIMARY KEY,
  handle      TEXT,                        -- optional public display name
  email_enc   BYTEA,                       -- encrypted at rest
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Account-level HD key material. xpub links a user's "anonymous" actions together,
-- so it is PII and MUST be encrypted at rest (R6, R7; VALUES §3).
CREATE TABLE account_keys (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  xpub_enc      BYTEA NOT NULL,            -- BIP32 xpub, encrypted (NEVER published)
  provider      TEXT NOT NULL,             -- e.g. 'turnkey'; where the master key lives
  sub_org_id    TEXT,                      -- Turnkey sub-organization (custody)
  wallet_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-thread derived keys. The public key + path are how a thread action is signed;
-- the platform can prove (user_id ↔ thread pubkey) privately without exposing user_id.
CREATE TABLE thread_keys (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id),
  thread_id     TEXT NOT NULL,             -- content thread this key is scoped to
  derivation    TEXT NOT NULL,             -- BIP32 path, e.g. m/44'/60'/0'/1/<threadIndex>
  pubkey        TEXT NOT NULL,             -- public; appears in the envelope as author ref
  address       TEXT,                      -- chain address form, if used
  claimed       BOOLEAN NOT NULL DEFAULT false,  -- user has publicly claimed this thread
  claimed_at    TIMESTAMPTZ,              -- nullable; claim may be undone (R8, R9)
  UNIQUE (user_id, thread_id)
);
CREATE INDEX ON thread_keys (pubkey);

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

-- Local mirror of block/anchor bookkeeping (the immudb root + bundle root we published).
CREATE TABLE anchors (
  id                 UUID PRIMARY KEY,
  bundle_merkle_root TEXT NOT NULL,
  immudb_tx_id       BIGINT NOT NULL,
  immudb_tx_hash     TEXT NOT NULL,
  tx_count           INTEGER NOT NULL,
  target             TEXT NOT NULL,         -- 'github' | 'evm' | …
  external_ref       TEXT,                  -- commit/tag or chain tx id
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`PrivateStore` exposes typed methods over these: `putContent`, `getContent`, `redact`,
`erase`, `isRevealable` (promoted from `immudb-test`), plus `putUser`, `putAccountKey`,
`putThreadKey`, `claimThread`/`unclaimThread`, `putAttestation`, `putSponsorship`,
`recordAnchor`. Encryption of `xpub_enc`/`email_enc` uses a KMS-managed key (Values §9: the
key is never committed; see §8 open question on key management).

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

## 6. Identity: per-thread keys and ownership (graduates from `turnkey-test`)

The requirements: per-thread keys (R2, R3); the platform proves a key belongs to a verified
user **without exposing the user** (R7); the user may stay anonymous or **claim** a thread
reversibly (R8, R9); an independent org can verify ownership if the user shares their xpub (R11).

The `turnkey-test` spike established the mechanism (BIP32, master `m/44'/60'/0'/0/0`,
per-thread `m/44'/60'/0'/1/<threadIndex>`, Turnkey custody, `signRawPayload`). This module
promotes it:

- **`derivation.ts`** — thread-path construction and, given a user's **xpub**, deterministic
  derivation/validation of a thread public key (via `@scure/bip32`, no private key needed).
- **`ownership.ts`** —
  - *Platform-side, private:* prove `thread_keys.pubkey` derives from `account_keys.xpub_enc`
    at the recorded path → confirms a real verified user owns it, **without storing or
    publishing which user** in the public record.
  - *User/auditor-side:* a user may share their xpub with an independent organization, who
    re-derives every thread key and confirms the set of actions is theirs — the platform is
    not in the loop (R11; Values §3). The org must KYC the user themselves to bind
    xpub→identity.
  - *Claim / unclaim:* `claimThread()` flips `thread_keys.claimed` and may publish a claim
    record; reversible per R9 (claiming "may be undoable").

xpub is **PII, encrypted at rest, never published** (Values §3). This module never writes
private key material anywhere; signing stays in the custody provider (Turnkey).

---

## 7. Public surface (`src/index.ts` exports)

What product workspaces and audit tooling import. Deliberately small; internals stay internal
(Philosophy §2.3).

```ts
// Append + read the verifiable record
export { PublicLedger } from "./ledger/ledger.js";
export type { AppendInput, AppendResult } from "./ledger/ledger.js";

// Connectors (choose transport by config; default pgwire)
export type { LedgerConnector, LedgerRoot, RowVerification } from "./ledger/connector.js";
export { PgWireLedgerConnector } from "./ledger/pgwire.connector.js";
export { GrpcLedgerConnector } from "./ledger/grpc.connector.js"; // optional

// Private store (server-only; never bundled into the public site)
export { PrivateStore } from "./private/store.js";

// Identity / per-thread keys
export { threadAccountPath, deriveThreadPubkey } from "./identity/derivation.js";
export { proveThreadOwnership, claimThread, unclaimThread } from "./identity/ownership.js";

// Publish + audit
export { buildBundle } from "./export.js";
export { verifyBundle } from "./verifier.js";          // OFFLINE — the public audit entry point
export type { PublicBundle, AnchorRecord, BundleEntry } from "./schema/envelope.js";

// Anchoring
export type { AnchorTarget } from "./anchor/anchor.js";
export { GithubAnchorTarget } from "./anchor/github.target.js";
export { EvmAnchorTarget } from "./anchor/evm.target.js";

// Shared crypto (also what independent auditors reimplement against)
export { canonicalJson, contentCommitment, newSalt } from "./crypto/commitment.js";
export { merkleRoot, merkleProof, verifyMerkleProof, hashLeaf } from "./crypto/merkle.js";

// Schemas / wire types
export type { PublicEnvelope, RecordType } from "./schema/envelope.js";
```

The **`verifyBundle` + crypto exports are the documented audit surface**: an outside party
can either import them or reimplement them from the documented schemas, and verify the
published record with no server access (Values §1; spec §11.3, §12.3).

---

## 8. Anchoring, blocks, and cadence

Per REQUIREMENTS.md R14–R16 and FINDINGS §4:

- Accumulate appends into a **block**; **anchor on block close** — at **N actions** (proposal:
  start at a small N in dev, target ~10k) **or daily**, whichever comes first. The closing
  builds an export bundle, computes `bundleMerkleRoot`, reads the immudb root, and writes an
  `AnchorRecord`.
- **Pluggable targets behind `AnchorTarget`** (R15; Values §8), supporting more than one
  simultaneously: a **transparency log** (GitHub `anchors.jsonl` + tag — cheap, human-auditable)
  and a **chain** (`anchor(bytes32)` of the bundle root). Signing for the chain target is
  delegated to the same custody layer as `turnkey-test` (`signRawPayload`,
  `HASH_FUNCTION_NO_OP`, secp256k1); broadcasting is the one thin step left for a follow-up.
- `anchors` table (§5.1) mirrors what we published so the platform can show users a direct
  link from their action → block → anchor (spec §11.4 self-audit).

> **Spec reconciliation — resolved.** Contributor spec §3.4 and §11 now describe this model
> directly: immudb is the off-chain verifiable record, the chain is only a **pluggable anchor
> target**, and the **preferred primary anchor is Ethereum** (most decentralized), with a
> transparency log (GitHub) as a low-cost complement and EVM L2 / Solana available as
> alternatives. Solana (originally considered for a delivery partnership) is now one optional
> target rather than "the ledger." `turnkey-test`'s secp256k1/EVM derivation already aligns
> with an Ethereum target. Remaining sub-decision (L1 vs an EVM L2) is open question #1.

---

## 9. Open questions for review

1. **Primary anchor chain.** Direction set and reflected in spec §3.4/§11: **Ethereum
   preferred** (R15), pluggable, with a GitHub transparency log as a complement; Solana
   de-scoped from "the ledger" to one optional target. Remaining: confirm **L1 vs an EVM L2**
   for cost/latency before the anchoring phase.
2. **At-rest encryption key management** for `xpub_enc` / `email_enc` — KMS choice (GCP/AWS
   per spec §3.1), rotation, and who can decrypt. Must satisfy "no secrets in git" (Values §9).
3. **gRPC connector in v1 or later?** Recommendation: ship pg-wire only in v1; add the gRPC
   watchdog connector once the live self-check is worth operating (FINDINGS §5b).
4. **Signature scheme on the envelope** — secp256k1 (matches turnkey/EVM) confirmed? Affects
   `author_pubkey`/`signature` sizing in §5.2.
5. **Claim/unclaim publication** — does claiming a thread publish a record to the ledger, or
   only flip a private flag surfaced in the read API? Affects anonymity-set reasoning (Values §3).
6. **Block size N and fallback interval** — confirm the production target and the dev default.

---

## 10. Phasing

**Phase 1 — Core verifiable record (MVP).** Promote `crypto/*`, `schema/envelope`,
`export`, `verifier`. Build `PgWireLedgerConnector`, `PublicLedger`, expanded `PrivateStore`
(content + redact/erase + users/keys). Property tests mirroring immudb-test 01–06, 09.
Outcome: signed appends, commitments-only ledger, offline audit — over the recommended
transport.

**Phase 2 — Identity & ownership.** `identity/*` promoted from turnkey-test: per-thread
derivation, private ownership proof, xpub-based independent verification, claim/unclaim.
KYC attestation + sponsorship tables wired.

**Phase 3 — Anchoring.** `anchor/*` with GitHub + chain targets; block-close cadence; the
`anchors` mirror; end-to-end test mirroring immudb-test 07–08 (anchor → offline verify
against externally-fetched root).

**Phase 4 — Watchdog (optional).** `GrpcLedgerConnector` as a continuous independent
auditor beside the pg-wire writer (FINDINGS §5b).

Each phase ends with passing property tests that assert the security properties, not just
behavior (Values §10).

---

_Approve, amend, or push back on the open questions in §9 before code begins, per
[`PHILOSOPHY.md`](../docs/PHILOSOPHY.md) §3._
