# immudb evaluation — findings

_OurSay, first hands-on evaluation. Stack: immudb 1.1.0 + Postgres 16 in Docker, tests in
Mocha/Chai (TypeScript via tsx). 20 deterministic tests + 1 opt-in physical test, all green._

## TL;DR

- **immudb works as a tamper-evident, append-only ledger.** Every read is backed by a
  cryptographic inclusion + consistency proof checked against a locally-held trusted root.
  Corrupt the trusted anchor (or the server's history), and verified reads **fail hard**.
- **immudb alone does not make the operator trustless, and cannot delete data.** Those two
  facts shape the whole design: we put **only salted hash commitments** in immudb, keep
  **raw content + PII in Postgres** (mutable, erasable), and **anchor the root externally**
  so third parties can verify without trusting us.
- **Redaction for the Online Harms Act is achievable without breaking integrity**: withhold
  the plaintext from the published bundle; the commitment (hash) stays in the immutable
  ledger, so every Merkle proof still verifies. Raw content is retained privately for law
  enforcement. True erasure is the same move plus destroying the private plaintext.
- **Anchoring closes the loop.** We publish a bundle (envelopes + Merkle proofs) and anchor
  its root to GitHub and/or a blockchain. An **offline** verifier validates revealed *and*
  redacted entries against the anchored root, with no connection to our server.
- **Reach up to the latest server via pg-wire.** immudb **1.11.0** speaks the PostgreSQL wire
  protocol with native verification SQL functions (`immudb_state()`, `immudb_verify_row()`), so
  a plain, maintained `pg` client replaces the dead Node gRPC SDK (suite 09). **This is the
  recommended integration path**; the anchoring layer is source-agnostic. See §5.

---

## 1. Public vs private data model

**Decision: immudb holds hash commitments only; a separate mutable Postgres store holds raw
content + PII. NOT two immudb databases.**

The five public types — `post`, `reaction`, `comment`, `poll`, `vote` — are verified
key-value entries keyed by `"<type>:<id>"`. The value is a canonical-JSON **envelope**:

```json
{ "v":1, "type":"post", "id":"…", "authorRef":"alice",
  "createdAt":"2026-06-15T…Z", "contentHash":"<sha256 hex>" }
```

The envelope commits to the content via `contentHash` and **never contains the plaintext**
(test 01 asserts the raw text never appears in immudb). The commitment is:

```
contentHash = sha256( canonicalJson({ ds:"oursay/v1/content", id, salt, content }) )
```

`salt` is a per-record 32-byte secret stored **only** in Postgres. It is mandatory: a vote
is ~2–8 possible values, so an *unsalted* hash would be trivially reversible by brute force.
Test 05 confirms that guessing `{"option":"yes"|"no"|"abstain"}` does **not** match the
published hash — the salt makes the commitment *hiding*.

Why not a second immudb database for private data? Because **immudb is append-only and cannot
truly delete**. PII or raw content placed in any immudb database could never be erased, which
is incompatible with redaction / right-to-erasure. Postgres is mutable, so `redact()` and
`erase()` are real operations.

| | immudb (public ledger) | Postgres (private store) |
|---|---|---|
| Contents | envelopes = commitments + public metadata | `raw_content(id,salt,content)`, `users`, `keys` |
| Mutability | append-only (a feature) | mutable / erasable |
| Anchored? | yes (root hash) | no |

---

## 2. Tamper-evidence — what an altered database looks like

immudb keeps an Authenticated Hash Tree (Merkle). Each verified read returns inclusion +
dual (consistency) proofs, which the client checks against the **trusted root** it persists
locally (`.state/immudb-root`). Tampering surfaces as a **verification failure**, not silent
bad data.

**Deterministic demo (test 03, runs in CI).** After an honest `verifiedGet` succeeds, we flip
one byte of the locally-held trusted root hash and read again — `verifiedGet` **rejects**.
This models the real threat: a server that tries to serve a rewritten history, or a tampered
anchor, cannot satisfy a proof against a root it doesn't actually extend.

**Physical demo (test 04, `@physical`, opt-in).** We stop immudb, overwrite 256 bytes inside
its data volume from a throwaway busybox container, and restart. Result: the tamper is
surfaced (immudb errors / the verified read against the pre-tamper root fails). This path is
**non-deterministic by nature** — depending on which bytes are hit, immudb may refuse to
start, throw an I/O error, or fail verification — so it is excluded from the default run and
rebuilds the volume afterwards. The dependable guarantee is test 03.

> Practical note: an honest, *append-only* immudb never lets you "edit" a row through the API
> at all — there is no UPDATE/DELETE of history. To produce an "altered database" we had to
> corrupt storage out-of-band. That is the point: tampering requires bypassing immudb, and
> when you do, verification catches it.

---

## 3. Redaction & erasure (Online Harms Act)

Because the immutable ledger stores only the **hash**, we control disclosure entirely in the
mutable store:

- **Redaction (default, OHA "stop distributing"):** `priv.redact(id)` marks the row; the
  export omits its plaintext but keeps the envelope + hash + proof. Raw content is **retained
  privately** for law enforcement, who can recompute the commitment from `(salt, content)`
  and prove it matches the ledger (test 05). The dataset still verifies end-to-end.
- **True erasure (right-to-be-forgotten):** `priv.erase(id)` nulls `content` + `salt` and
  timestamps `erased_at`. The plaintext is physically gone and can never be revealed or
  re-proved; the ledger commitment remains as a tombstone and the rest of the dataset still
  verifies (test 06).

In both cases the published entry degrades gracefully to "present and provably included, but
plaintext withheld" — represented by its `contentHash` only.

---

## 4. Anchoring to external public infrastructure

Publishing the data + proofs is only trustless if the **root** lives somewhere we don't
control. We export a bundle and anchor two roots:

- `immudbRoot` (txid + txhash) — proves the ledger's internal append-only integrity.
- `bundleMerkleRoot` — an app-level Merkle root over the published envelopes, enabling
  **offline** third-party verification independent of immudb internals (the maintained
  `immudb-node` client verifies internally and does not expose raw proofs, so we build our
  own Merkle layer over the same envelopes).

A real anchor record produced by the tests:

```json
{"bundleMerkleRoot":"27cb0db59e72bed90bda1f7b33b9582d08e7ccfcfae7094bcf32769c69c245b0",
 "capturedAt":"2026-06-15T19:20:16.697Z",
 "immudbRoot":{"txhashHex":"de4a7b95…f36b4dde","txid":23},
 "ledgerDb":"defaultdb","txCount":1,"v":1}
```

**(a) GitHub anchoring** (`src/anchor-github.ts`, test 07). Append the anchor record to a
public `anchors.jsonl` and tag the commit (`anchor-tx23-27cb0db59e72`). Cheap, human-auditable,
timestamped by GitHub's commit graph. This is the natural place to publish the **public data
itself**: a repo holding the bundle (envelopes + proofs), where redacted entries appear as
just their hash. Anyone can clone it and run the verifier. Weakness: GitHub / the repo owner
is semi-trusted (history rewrites are detectable via tags + the commit graph, but not
impossible) — good as a transparency log, best combined with (b).

**(b) Blockchain anchoring** (`src/anchor-evm.ts`, test 07). Put `bundleMerkleRoot` in an
`anchor(bytes32)` call. Once mined, the root + timestamp are immutable and globally verifiable
without trusting OurSay or GitHub. The test builds the calldata, signs the tx digest **offline**
with secp256k1, and recovers the signer — no broadcast, no faucet, fully deterministic. In
production this signing is delegated to the **Turnkey** wallet already used in `../turnkey-test`
(`signRawPayload` + `HASH_FUNCTION_NO_OP` over the same secp256k1 curve). A cheap L2 or an
OP_RETURN-style commitment would be the production target; broadcasting to a testnet is the
only remaining step and was intentionally left out of the test to keep it hermetic.

**The trust pivot (test 08).** The offline verifier is handed the bundle **and** the anchored
Merkle root fetched *independently* (from the GitHub file / chain event). It:

1. checks `bundle.anchor.bundleMerkleRoot == anchoredRoot` (binds the bundle to external infra),
2. recomputes each leaf = `hashLeaf(canonicalJson(envelope))` and verifies its Merkle proof to
   the anchored root,
3. for **revealed** entries, recomputes the commitment from `(salt, content)` and checks it
   equals `envelope.contentHash`,
4. for **redacted/erased** entries, accepts on hash-only inclusion (no plaintext needed).

A tampered envelope (test 08) or a root that doesn't match the anchor is **rejected**. A
malicious operator cannot produce a bundle that both verifies internally and matches the
externally-anchored root without also compromising GitHub/the chain.

**End-to-end chain of trust:**

```
blockchain / GitHub  →  anchored bundleMerkleRoot  →  Merkle proof  →  envelope.contentHash
                                                                         │
                                              revealed: salt+content ────┘ (recompute & match)
                                              redacted: withheld  ──────── (hash only; still included)
```

This satisfies the brief: the data **always exists** (commitment is permanent; raw retained
privately for law enforcement), yet we **do not distribute** redacted content — auditors get
a verifiable hash in its place.

---

## 5. Client/server version compatibility — and the modern path

The maintained npm gRPC client **`immudb-node@1.1.1`** predates immudb's **v1.2**
transaction-header format change (`TxMetadata` → versioned `TxHeader`). Against modern servers
its dual-proof math fails (tested empirically):

| immudb server | `immudb-node@1.1.1` verifiedSet/Get |
|---|---|
| **1.1.0** | ✅ verifies |
| 1.2.4 | ❌ dual verification failed |
| 1.3.2 | ❌ dual verification failed |
| 1.9.5 | ❌ dual verification failed |

Worse, the Node gRPC clients are effectively unmaintained: unscoped `immudb-node` is 4 years
old; `@codenotary/immudb-node` is stuck at `2.0.0-alpha`. **So do not build OurSay on a Node
gRPC immudb client.** Suites 01–08 pin **immudb 1.1.0** only to exercise *genuine* gRPC proofs
as a baseline — not as a deployment recommendation.

**The modern path: immudb 1.11.0 over the PostgreSQL wire protocol (suite 09).** This is the
recommended way to "reach up" to the latest server, and it works today with a plain, fully
maintained `pg` client — see §5a. The architecture itself (commitments + external Merkle
anchoring + private store) is version-independent and does not depend on immudb's internal
proof wire format, so it carries over unchanged.

### 5a. immudb 1.11.0 via pg-wire — empirical results

Verified against `codenotary/immudb:1.11.0` with `node-postgres`:

- **Connection & schema:** `pg` connects with default creds (`immudb`/`immudb`, db `defaultdb`),
  no SSL needed; `CREATE TABLE … PRIMARY KEY (id)` works. pgsql server is **on by default**
  (`--pgsql-server`, port 5432; we map host **5433**).
- **Native verification as SQL functions** (no client-side crypto, no gRPC):
  - `SELECT immudb_state()` → `{db, tx_id, tx_hash, …}` — the anchorable root.
  - `SELECT immudb_verify_row('public_ledger','<pk>')` → `{verified:'true', tx_id, revision, …}`.
  - (`immudb_verify_tx`, `immudb_history`, `immudb_tx` also exposed.)
- **1.11.0 adds real ORM support:** `pg_catalog`/`information_schema` resolvers and functions like
  `current_database`, `format_type`, `has_table_privilege` (Django/SQLAlchemy/GORM/ActiveRecord).

**pg-wire quirks we hit (and how to handle them):**

| Quirk | Handling |
|---|---|
| `rowCount` is **not reported** for SELECT (node-postgres sees `0` even with rows) | key off `result.rows.length`, never `rowCount` |
| Extended-protocol **params do not work as function arguments** (`immudb_verify_row(…, $1)` → `tbtree: key not found`) | pass the pk as a **literal** (escape quotes; ours are UUIDs) |
| Reusing the **same parameterized SELECT** rapidly on one long-lived connection can return a **stale prior result** (portal/statement reuse) | use a literal `WHERE` for point reads, or fresh statements |
| pg **wire** ≠ full pg **dialect** | use raw SQL; avoid tooling that issues Postgres-specific catalog/DDL |

Parameterized **INSERT** (extended protocol) works fine — the quirks are isolated to SELECT
result metadata, function-arg binding, and rapid statement reuse.

### 5b. Trust-model note (important)

The pg-wire verification functions run **server-side**, so `immudb_verify_row()` is a more
*server-trusting* check than the gRPC client computing a proof against an independently-held
trusted root. This is **fine for OurSay** because our zero-trust guarantee does **not** live in
immudb's API: it lives in the **external Merkle anchoring + offline independent verifier**
(suites 07–08), which suite 09 shows is **source-agnostic** — it verifies pg-wire-sourced
envelopes identically. immudb's job is the append-only authority; trustlessness comes from the
anchored root. If we ever want in-process client-side proofs, that's the one case for a
maintained **Go or Python SDK sidecar**.

#### Verification vs anchoring — what each guarantees

These are two different properties; neither replaces the other. The distinction is **where the
proof is computed**, and **where the root is pinned**.

**gRPC verified API — client-side proof.** The server returns the data *plus the raw proof
material* (inclusion proof, dual/consistency proof, signed state); the **client** recomputes the
hashes and checks them against a trusted root it holds locally (in our vendored client,
`verifyInclusion()` / `verifyDualProof()` run client-side and *reject* if the math doesn't
reconcile with `this.state`). The server never gets to *assert* success — it's derived from
public, deterministic math, so the server is **outside the trusted base** for that read.

**pg-wire `immudb_verify_row()` — server-side proof.** The verification runs *inside* the
server and returns a verdict (`verified: 'true'`). The pg-wire functions do **not** hand back the
raw inclusion proof, so the client cannot reconstruct the check itself. A compromised server
could return `'true'` regardless. (`immudb_state()` does return the signed root, so you can still
anchor — you just can't do client-side row proofs.)

**Why gRPC still requires anchoring.** Client-side proofs only prove *consistency relative to a
root you already hold* — they say nothing about where that root came from:

1. **Provenance / fork (trust-on-first-use).** On first contact the client trusts whatever root
   the server presents. immudb signs the state, but with the **operator's** key — so an operator
   who controls the server from the start can present a self-consistent but fabricated history,
   and every gRPC proof passes against the operator's own root. gRPC catches a server that
   *rewrites history after* you pinned a root; it does not catch an operator who *forked from
   genesis*, nor **equivocation** (different histories to different parties). Only pinning the
   root to a medium the operator doesn't control (chain / GitHub) closes this.
2. **Public verifiability.** gRPC proofs help *our backend* check *our server*. Auditors,
   journalists, and citizens aren't running our client with a root held since genesis — they need
   an **externally-anchored root** to verify the published data against. Anchoring is what turns
   "our backend trusts our server" into "anyone can verify without trusting us."

**How they compose.** Anchoring is the ultimate source of truth in **both** transports and is
more fundamental than gRPC-vs-pg-wire: with the anchor + our app-level Merkle bundle, third
parties get full *offline* verifiability either way. gRPC's *additional* value is cheap,
continuous, in-process tamper detection against the live server **between** anchor points — which
is exactly what immudb's **independent auditor** is (client-side verification as a watchdog).
pg-wire trades that away and leans entirely on server-side verify + the external anchor + the
auditor. **Bottom line: anchoring is required regardless of transport; gRPC adds real-time,
operator-independent self-checking that pg-wire's server-side functions can't.**

### 5c. Recommendation

- **Adopt immudb 1.11.0 over pg-wire with the `pg` client** for app integration; keep the
  app-level Merkle/anchor layer as the trust root.
- Do **not** depend on the Node gRPC SDKs; do **not** fork `immudb-node` (you'd be
  re-implementing security-critical proof crypto).
- Add immudb's **independent auditor** process in production for continuous server-side
  consistency checking, complementing the external anchor.

---

## 6. Gotchas worth remembering

- **Trusted state must persist** between sessions or a server can lie on first contact. The
  client writes it to `.state/immudb-root`; auditors must seed the *anchored* root, not blindly
  trust the server's `currentState`.
- **Canonical JSON is load-bearing.** Every hash/proof depends on byte-exact re-serialization
  (sorted keys). Producers and verifiers must use the identical canonicalizer (`src/commitment.ts`).
- **Mocha + ESM + TS**: load via `--node-option import=tsx`; the legacy `grpc` types in
  `immudb-node`'s `.d.ts` are handled by `skipLibCheck` (runtime uses pure-JS `@grpc/grpc-js`).
- **`exit: true`** in `.mocharc.json` — the pg pool keeps the event loop alive otherwise.
- The physical test stops the container; run it **alone** (`test:physical`) and let it rebuild
  the volume.

## 7. Test inventory

| Suite | What it proves |
|---|---|
| 01 ledger | commitments in immudb, plaintext only in Postgres; 5 types as prefixes |
| 02 verified-proofs | verifiedSet/Get round-trip; consistency T1→T2; anchorable root |
| 03 tamper-forged-state | forged trusted root ⇒ verifiedGet rejects (deterministic) |
| 04 tamper-physical `@physical` | on-disk corruption is surfaced (opt-in, non-deterministic) |
| 05 redaction | withhold plaintext, proofs intact, salt hides votes, LE can recompute |
| 06 erasure | destroy plaintext + salt; tombstone; dataset still verifies |
| 07 anchoring | GitHub artifact/tag + EVM offline sign & recover |
| 08 independent-verifier | offline audit vs anchored root; rejects tampering & root mismatch |
| 09 immudb 1.11.0 pg-wire `@pgwire` | latest server via `pg`; `immudb_state()` + `immudb_verify_row()`; anchoring layer is source-agnostic |

_Run: `npm run test:unit` (all 20, incl. suite 09 against immudb 1.11.0) · `npm run test:physical` (opt-in)._
