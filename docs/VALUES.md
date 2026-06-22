# OurSay — Engineering Values

_The contributor spec (§2) states the platform's **product** guiding principles. This
document translates them into **engineering** values: the concrete, technical commitments
that constrain how we build. Where the spec says "auditability above all," this document
says what that forbids and requires in code. For repository structure and process, see
[`PHILOSOPHY.md`](./PHILOSOPHY.md)._

Each value below names the product principle it serves, then states what it means
concretely — including what it rules out.

---

## 1. Auditability is a property of the code, not a promise

> _Serves: "Auditability above all." "Minimal trust required."_

No result may ever require trusting OurSay's word, and that has to be true at the level of
running code, not marketing.

- Every significant action produces a **commitment anchored to infrastructure we do not
  control**, and the tooling to verify it ships in this repository.
- The **offline independent verifier** must be able to validate published data using only
  a published bundle and an externally-anchored root — no connection to our servers, no
  access to our database, no trust in our process.
- Audit tooling depends only on shared primitives and public schemas (see
  [`PHILOSOPHY.md`](./PHILOSOPHY.md) §4). If verifying OurSay requires running OurSay, we
  have failed this value.
- **What this rules out:** "trust me" verification endpoints as the _only_ check;
  proofs computed solely server-side with no externally-anchored root behind them;
  undocumented data structures an outside auditor cannot reconstruct.

## 2. Minimize trust; locate it explicitly

> _Serves: "Minimal trust required."_

We do not get to be trusted by default, so every place where trust is still required must
be **named, minimized, and on a path to removal**.

- The trust root is the **externally-anchored root + offline verifier**, never a single
  internal component. A verifiable database does not make the operator trustless (the
  immudb findings prove this — first-contact and server-side verification still trust the
  operator's root).
- Where trust is unavoidable for the MVP (e.g. geographic/KYC-filtered result sets), say
  so plainly, sign the results, and design the **pluggable path to remove that trust**
  later (multi-provider KYC attestation, node attestations).
- Defense-in-depth is welcome (gRPC client-side proofs as a live watchdog), but it
  supplements the anchor; it does not replace it.

## 3. Anonymity is a property to preserve, not a feature to bolt on

> _Serves: "Anonymity is a right, not a loophole."_

Anonymity at the individual level and auditability at the aggregate level must **coexist**,
and the code must keep them as distinct properties.

- A user acts through a **per-thread key** so their separate actions are not trivially
  linkable. The platform can verify a per-thread key belongs to a real, verified user
  **without exposing which user** (keys are HKDF-derived on-device from a jurisdiction master; the
  linking material is PII held privately, not on the record).
- Material that links a user's actions together (the platform's per-thread **registration
  bindings** and **commitment openings** — `user_id`, `salt_t`) is **PII, encrypted at rest**,
  never published, and accessible to the user for self-audit or authorized per-thread reveal.
  Nothing published links one thread to another — published records carry only `thread_pubkey`, and
  the per-thread commitment is opaque and appears only in the platform's signed settlement
  attestation metadata.
- "Verified" and "identified" are **different fields**: a verified anonymous action counts
  in its tier total while displaying no identity. Never conflate them anywhere in the
  system.
- **What this rules out:** reusing one key across a user's threads; storing linkage
  material in the append-only ledger; deriving public identifiers from anything that
  narrows the anonymity set.

## 4. Censorship and erasure must be minimal and integrity-preserving

> _Serves: legal compliance (Online Harms Act) without breaking auditability._

When law requires us to stop distributing content, we remove **the least possible** and
keep the record verifiable.

- The ledger stores only a **salted hash commitment**, so disclosure is controlled entirely
  in the mutable private store. **Redaction** withholds plaintext from the published bundle
  while retaining it privately for law enforcement; **true erasure** destroys the plaintext
  and salt, leaving a tombstone.
- In both cases the timestamp, public key, parent thread, and every other public field stay
  public, and **every Merkle proof still verifies** — the entry degrades to "present and
  provably included, plaintext withheld."
- An auditor who legitimately holds the content can always recompute the commitment and
  confirm we acted in good faith.
- **What this rules out:** deleting entries from the public record; any redaction that
  invalidates existing proofs; storing redactable content where it cannot be erased.

## 5. Determinism and reproducibility are load-bearing

> _Serves: "Auditability above all." "Minimal trust required."_

Every hash and proof depends on byte-exact agreement between independent parties, so
determinism is a security property, not a nicety.

- **Canonical JSON is sacred.** One shared canonicalizer (sorted keys, no incidental
  whitespace) is used by every producer and every verifier. Never hand-serialize anything
  that will be hashed.
- **Domain separation** on every hash (content domain tags, RFC-6962 leaf/node prefixes) so
  a value computed for one purpose can never be reinterpreted as another.
- **Versioned formats.** Anything published or anchored carries a `v` so historical data
  stays verifiable as formats evolve.
- **Reproducible builds.** Every production deployment publishes a build hash (anchored and
  in `DEPLOYMENTS.md`) that anyone can reproduce from source. The running app must be
  provably the published code.

## 6. Commit to hide, not just to bind

> _Serves: "Anonymity is a right." auditability._

A commitment in the public ledger must reveal nothing about low-entropy content.

- Commitments are **salted** with a per-record 32-byte secret stored only privately. A vote
  has ~2–8 possible values; an unsalted hash would be brute-forceable in microseconds.
- The salt makes the commitment **hiding** as well as **binding**: the public sees that
  _an_ action occurred and can verify it, but cannot recover _what_ without the revealed
  plaintext.

## 7. Generic by design; no jurisdiction hardcoded

> _Serves: "Generic by design." forkability._

OurSay deploys for any democratic system anywhere. Code must never assume one.

- No geographic term, verification-tier label, content category, KYC provider, language, or
  character set is hardcoded. All of it is **deployment configuration**, not platform logic.
- Integrations sit behind **abstraction layers** (KYC providers; ledger connectors; anchor
  targets) so swapping one is configuration, not a rewrite.

## 8. Pluggable boundaries at every external dependency

> _Serves: forkability, minimal trust, longevity._

Anywhere we touch an outside system, we put an interface, not a hard call.

- **KYC providers** are pluggable per region (multiple concurrent, mapped to tiers).
- **Ledger transport** is pluggable: the same envelope/commitment model must work over more
  than one connector (e.g. gRPC verified API _or_ the Postgres wire protocol), because the
  trust layer lives in anchoring, not in the transport.
- **Anchor targets** are pluggable (a public transparency log and/or a chain), because no
  single external venue should be a single point of trust.
- This keeps us off dead-end dependencies (the immudb findings: do not build on the
  unmaintained Node gRPC SDK) and lets the strongest available option win without a rewrite.

## 9. No secrets, no political thumb on the scale

> _Serves: "No political agenda." open-by-requirement._

- **No secrets, credentials, or private keys are ever committed** — not in product code,
  not in a spike. Defaults in committed config are non-secret and match local Docker.
- All content is treated equally by platform mechanics. The platform is a neutral civic
  tool; ranking, filtering, and counting must be content-neutral and equally applied.
- Every deployment stays open and auditable — a license condition, enforced, not a
  courtesy.

## 10. Tests assert security properties, not just behavior

> _Serves: everything above._

A feature is not done when it works; it is done when the property it must guarantee is
proven by a test that **fails loudly when the property is violated**.

- Assert the adversarial cases: a forged root is **rejected**; a tampered envelope **fails**
  the verifier; a redacted entry **still verifies** by hash; guessing a low-entropy vote
  does **not** match the salted commitment.
- Prefer deterministic, hermetic tests as the dependable guarantee; keep non-deterministic
  demonstrations (physical disk corruption) opt-in and clearly labeled.
- The test suite is itself audit evidence — it is part of how we keep the promise in
  Value 1.

---

_These values are binding on contributors. When a design decision is unclear, it is
resolved in favor of the value with the lower number — auditability and minimal trust come
before convenience. Significant trade-offs against any value belong in a proposal or RFC
before code, per [`PHILOSOPHY.md`](./PHILOSOPHY.md) §3._
