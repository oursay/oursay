# Public Record — System Requirements

_The normative requirements for OurSay's public, verifiable civic record. This document
defines **what must be true**; the worked design that satisfies it is
[`PROPOSAL.md`](./PROPOSAL.md). It is the requirements baseline against which the
`@oursay/public-record` workspace is reviewed and tested._

> Supersedes the earlier working notes. Requirements here are intended to be
> stable; they change only through review, and a change that weakens an **[Invariant]** is a
> change to what OurSay fundamentally is.

---

## 1. Scope & conventions

**Scope.** This document covers the public record subsystem: how civic actions (posts,
petitions, comments, votes, reactions) are committed, signed, audited, anchored, redacted,
and verified — and the confidentiality and identity guarantees around them. It does **not**
cover product UX, the content/discussion model, or KYC provider integrations beyond the
guarantees the public record depends on. Those live in
[`../docs/01-CONTRIBUTOR-SPEC.md`](../docs/01-CONTRIBUTOR-SPEC.md).

**Normative keywords.** **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used per RFC 2119.

**Status labels.** Every requirement carries one:

| Label | Meaning |
|---|---|
| **[Invariant]** | Must hold for the lifetime of the platform. Changing it changes what OurSay is. |
| **[MVP]** | Required for the first public release. |
| **[Future]** | Planned. Not required for MVP, but the architecture MUST stay compatible with it. |

**Audience.** This is internal engineering documentation in a public repository. It uses
developer terminology freely (commitment, Merkle root, anchor, EVM). Public-facing surfaces
use the vocabulary in contributor spec §11.5 — see [`../docs/PHILOSOPHY.md`](../docs/PHILOSOPHY.md) §7.

**Traceability.** Requirements are identified `R1`–`R28` and mapped to the design in
[Appendix B](#appendix-b--traceability).

---

## 2. Authorship & signing

- **R1 [Invariant]** — Users MUST be able to append the record types — **`post`, `comment`,
  `reaction`, `petition`, `petition_signature`, `poll`, `vote`** — to the public record, as
  **append-only transactions** (create / update / delete). `post` is the **generic primitive**
  the product surfaces under a deployment label (the Alberta launch calls it a **"Belief"**); a
  `poll` is the question/container; a `vote` is the cast ballot on a poll; a `petition_signature`
  is a signature on a petition. A closed poll's **`result`** is a derived/published record (not a
  user append). Attachment & op rules (enforced by the service):
  - `comment` → post / petition / poll / comment, **nesting depth ≤ 3**;
  - `reaction` → post / comment only (kinds `check`/`cross`, **mutually exclusive** per author per
    target; extensible to custom emoji);
  - `petition_signature` → petition; `vote` → poll.
  The type set MUST be **extensible by configuration**, not hardcoded — candidate future types:
  `discussion`, `bill`, `official_response`. _A starting point, not fixed._
- **R1a [Invariant]** — **Governance is per-entity.** A `poll`/`petition` create transaction
  sets its rules (`region`, `deadline`, `allowChange`/`allowRevoke`); a **platform-signed**
  update may change them. A vote is **cast** and a signature is **signed FINAL by default**
  (the real-world analog); changing a vote or revoking a signature MUST be **technically
  possible** but permitted only when the entity's rules + deadline allow it (so a riding/region
  can follow its own mechanism).
- **R1b [Invariant]** — **Dual attachment.** Every comment and reaction MUST record BOTH the
  parent **entity** (follows edits) and the exact parent **revision** (content-addressed
  txHash). The record MUST be able to count support per-entity AND per-revision, so an edit to a
  parent does not transfer endorsements its old content earned to the new content.
- **R2 [Invariant]** — Every entry appended to the public record MUST be **signed by a
  per-thread key** controlled by its author.
- **R3 [Invariant]** — Per-thread keys MUST be **derived deterministically on the user's device**
  via **domain-separated derivation (HKDF or equivalent)** from a **level-scoped master key** (one
  master per governmental level), so a user (or an auditor the user authorizes) can reproduce and
  prove them. Per-thread keys MUST sign envelopes with the single canonical algorithm (**P-256**,
  passkey-native). Cross-device reproduction requires **recovery/sync of the level-master
  material** — the passkey alone (which authenticates and may *unlock* derivation material) is not
  sufficient. _Rationale: enables R7, R10, and R11 without the platform holding signing keys._
  > **Pivot flag (normative change):** previously "derived from a single master secret." This
  > invariant now mandates **level-scoped masters + on-device HKDF** (not BIP32 paths) as the
  > structural compartmentalization mechanism. See [`PROPOSAL.md`](./PROPOSAL.md) §6.

## 3. Data model & confidentiality

- **R4 [Invariant]** — The public record MUST store **only hash commitments and public
  metadata**. It MUST NOT store plaintext content or PII.
- **R5 [Invariant]** — Content commitments MUST be **hiding**: salted so that low-entropy
  content (e.g. a vote with a handful of possible values) cannot be recovered by brute-forcing
  the published hash.
- **R6 [Invariant]** — Raw content and PII MUST reside in a **separate, mutable store** that
  supports redaction and erasure. _Rationale: an append-only record can never delete, which is
  incompatible with R17–R19._

## 4. Anonymity & identity

> **Identity-model pivot (2026).** This section's invariants were updated when OurSay moved its
> identity backbone from **BIP32/xpub + remote Turnkey custody** to **passkey auth + level-scoped
> masters + on-device HKDF per-thread keys (P-256) + private per-thread platform bindings +
> selective reveal**. The normative changes are flagged inline at **R3** (derivation), **R7**
> (ownership mechanism), and **R11** (selective reveal vs xpub sharing). The pseudonymous
> public-ownership channel (claim/unclaim, R8/R9) is unchanged and is kept distinct from the
> identity-to-auditor reveal channel (R11). Rationale and the discarded approach:
> [`../turnkey-test/FINDINGS.md`](../turnkey-test/FINDINGS.md); worked design:
> [`PROPOSAL.md`](./PROPOSAL.md) §6.

- **R7 [Invariant]** — The platform MUST be able to verify that a per-thread key belongs to a
  **verified user, without exposing which user** in the public record. This is established by a
  **private platform registration binding** created before any verified-tier append: the platform
  signs a binding committing to `thread_pubkey, thread_id, level, kyc_tier, region` and an **opaque
  per-thread commitment** `H(user_id, salt_t, thread_id, level)`. The commitment is held in the
  private binding and surfaced only — opaquely — in the platform's **settlement attestation
  metadata** (referenced by `thread_pubkey`); the public envelope carries `thread_pubkey` only, and
  the opening (`user_id`, `salt_t`) stays private until selective reveal (R11).
  > **Pivot flag (mechanism change):** ownership is now proven via the private registration binding
  > + opaque commitment, **not** via deriving the key from an account `xpub`. See §6.
- **R8 [Invariant]** — A user MAY participate **anonymously**, or MAY publicly **claim**
  ownership of a thread's activity, exposing that activity as theirs.
- **R9 [Invariant]** — Claiming a thread MUST be **reversible**.
- **R10 [Invariant]** — A user MUST retain a **receipt/proof of each action** and be able to
  **self-audit** it against the public record at any time.
- **R11 [Future]** — A user MUST be able to authorize an **independent organization** to verify
  their thread activity by **selectively revealing specific threads** — publishing the opening
  `(user_id, salt_t, thread_id, level)` plus the platform binding **for those threads only**, never
  a single key that exposes all activity at a scope. The organization recomputes the commitment,
  confirms the platform's binding signature, and is responsible for binding the identity to the
  user's real-world identity (its own KYC). _MVP must remain compatible; full realization is
  Future._ A **user-signed** binding (in addition to the platform's) is the stronger end-state:
  it lets the organization verify ownership **without platform cooperation**.
  > **Pivot flag (normative change):** previously "sharing their account public key / xpub." R11 is
  > now **per-thread selective reveal** of binding openings, not xpub sharing — disclosure is
  > scoped to chosen threads, not all activity under a key. See §6.

## 5. Auditability & anchoring

- **R12 [Invariant]** — Any member of the public MUST be able to **reconstruct every entry,
  block, and root hash** from the published public data alone.
- **R13 [Invariant]** — The public MUST be able to audit validity at **three granularities**:
  an individual entry, a block, and the full record.
- **R14 [Invariant]** — The public record MUST be **anchored to external public
  infrastructure** the platform does not control, so its integrity is verifiable **without
  trusting the platform**.
- **R15 [Invariant]** — The **anchoring target MUST be pluggable**. The design MUST support
  swapping the target and MUST support anchoring to **more than one target simultaneously**,
  so no single external venue is a single point of trust. Candidate targets:

  | Target | Role | Notes |
  |---|---|---|
  | **Ethereum L1** | Primary trust anchor (preferred) | Most decentralized; strongest "no one can rewrite this" guarantee. |
  | EVM L2 | Cost-efficient frequent anchoring | Inherits Ethereum security; cheaper per anchor. |
  | Transparency log (e.g. GitHub) | Low-cost, human-auditable complement | Timestamped commit graph; semi-trusted, best paired with a chain. |
  | Solana | Alternative chain anchor | Originally considered; remains a valid pluggable target. |

  _Rationale: the platform is not bound to one chain. Ethereum is the preferred primary anchor
  on decentralization grounds; pluggability keeps the choice open and reviewable._

- **R16 [Invariant]** — Verification MUST be possible **fully offline**, using only the
  published data plus an **independently obtained anchor** (fetched from the external
  infrastructure, not from the platform).

## 6. Censorship, redaction & erasure

> **CRUD-delete vs. content-erase (two different operations).** A user **delete** is an appended
> `delete` transaction: it tombstones the folded state but the full history (and its hashes)
> remain on the chain. **Redaction/erasure** act on the *raw content* in the mutable store: the
> commitment (and thus the per-entity chain) is untouched, so the chain still verifies — after
> erasure on hashes alone (see `verifyEntityChain`). The two compose: a deleted entity can also
> have its content erased.

- **R17 [Invariant]** — The platform MUST be able to **redact specific content in the most
  minimal way possible**. Only the message content is withheld; the timestamp, public signing
  key, parent thread, and all other public metadata remain public, and **the same entry,
  block, root, and anchor hashes MUST still reconstruct** (the commitment stands in for the
  message). _A redaction MUST NOT invalidate any existing proof._
- **R18 [MVP]** — Redacted (but not erased) content MUST be **retained privately** so it
  remains available to lawful access.
- **R19 [Invariant]** — **True erasure** (right-to-be-forgotten) MUST destroy the plaintext
  and its salt, leaving a verifiable **tombstone**; the rest of the dataset MUST still verify
  end-to-end.
- **R20 [Invariant]** — An auditor who **holds the original content** MUST be able to
  recompute the content hash and transaction hash and confirm they match the public record —
  i.e. confirm the platform acted in **good faith**.

## 7. Good faith, data return & non-repudiation

- **R21 [Invariant]** — The platform MUST return **full datasets**, except where prohibited by
  law, in which case it MUST return **cryptographic proofs** in place of the withheld data.
- **R22 [SHOULD]** — Proof-only substitution SHOULD occur **only where strictly necessary**
  and MUST be minimized. Data SHOULD be returned in full by default.
- **R23 [Invariant]** — The system MUST be designed for **strong non-repudiation**: a recorded
  action's authorship and timing must be hard for any party — including the platform — to
  plausibly deny or forge.

## 8. Verification tiers & filtering

- **R24 [MVP]** — The platform MUST classify record activity by **user and KYC verification
  status** (verification tiers / badges, e.g. identity-verified, residency-verified, official,
  electorally validated — see contributor spec §4).
- **R25 [MVP]** — The platform MUST support **filtered retrieval** of public data by
  **geographic region** and **verification type**.
- **R26 [MVP]** — At MVP, filtered results MAY rely on platform trust, but the platform MUST
  **sign** filtered results so it cannot silently alter them. Where participants choose full
  public exposure, filtered results become **independently checkable**, so the platform cannot
  lie about them undetected. _This is the one facet that is trust-based at MVP; R27 removes it._
- **R27 [Future]** — Verification SHOULD become **decentralized and pluggable**: multiple
  concurrent KYC providers, **provider attestation signatures**, and node / independent
  attestations — so a user verified by several independent providers is more strongly verified
  than one verified by several validators sharing a single provider. This reduces reliance on
  platform trust for R24–R26. The architecture MUST keep KYC verification **pluggable** to
  make this reachable without restructuring.

## 9. Code transparency & build verification

- **R28 [MVP]** — The platform MUST publish its complete source and a **verifiable build
  hash**, so any person can confirm the deployed application is the published code, running
  without modification. _See contributor spec §3.5, §12.2._

---

## Appendix A — Design direction (non-binding)

_This appendix records the current architectural direction. It is **directional, not
normative** — requirements R1–R28 are the contract; the worked design is
[`PROPOSAL.md`](./PROPOSAL.md). It supersedes the informal "My Thoughts" notes from the
original assertions._

- **Two stores.** An **append-only verifiable ledger** (immudb) holds commitments + public
  metadata only; a **mutable Postgres store** holds raw content, salts, and PII. This split is
  what makes both auditability (R4, R12) and redaction/erasure (R17–R19) possible at once. See
  [`../immudb-test/FINDINGS.md`](../immudb-test/FINDINGS.md).
- **Per-thread keys.** Users hold a **level-scoped master key per governmental level**; per-thread
  keys are derived **on-device via HKDF** from the matching level master (R3) and sign envelopes
  with **P-256**. The platform links a thread key to a verified user through a **private
  registration binding** carrying an **opaque per-thread commitment** — this binding, its `salt_t`,
  and any commitment opening are PII, **encrypted at rest, never published** until the user
  authorizes a **selective reveal** of specific threads (R11). Custody is the user's device/passkey;
  Turnkey is an **optional recovery** path only. The discarded BIP32/xpub/Turnkey-custody spike is
  documented in [`../turnkey-test/FINDINGS.md`](../turnkey-test/FINDINGS.md).
- **Pool → settle → publish.** Actions are first **pooled** (Postgres `record_outbox`, `pending`,
  tagged with their `chainId`); nothing reaches the ledger on the user's action. A **block** is
  **settled** when its trigger fires — `BLOCK_MAX_PENDING` records accumulated **or** the oldest
  pending tx has waited `BLOCK_MAX_PENDING_AGE_HOURS` (env-configurable; `0` disables a dimension),
  whichever comes first, capped at `BLOCK_MAX_TXS` — committing the block's commitments to immudb
  (`record_chain`) and writing a `(chainId, height)` block header (`record_blocks`, the canonical
  block tip). **Publishing/anchoring is a separate, per-target cadence** (`AnchorPublisher`), not the
  same step as settlement.
- **Anchor targets are pluggable** (R15): **Ethereum is the preferred primary anchor** on
  decentralization grounds, with a transparency-log target (GitHub) as a low-cost complement and
  other chains (EVM L2, Solana) available. _Solana was originally considered for delivery-partner
  reasons; that is not a binding constraint, and anchoring remains pluggable._
- **Pluggable transport.** The ledger is reachable over multiple connectors (Postgres wire
  protocol recommended; gRPC optional) — see [`PROPOSAL.md`](./PROPOSAL.md) §4. The trust root
  is the externally-anchored root + offline verifier (R14, R16), independent of transport.

These choices are reviewable. What is fixed is the requirement set above.

---

## Appendix B — Traceability

Where each requirement is addressed in the design. Sections refer to
[`PROPOSAL.md`](./PROPOSAL.md).

| Requirement | Addressed in |
|---|---|
| R1 record types (post/petition/comment/vote/reaction) | §3 (append flow), §5.3 (envelope `RecordType`) |
| R2 per-thread signing | §3, §5.2 (`signature`, `author_pubkey`), §5.3 |
| R3 deterministic derivation | §6 (on-device HKDF from a level master, `identity/derivation.ts`) |
| R4 commitments-only ledger | §3, §5.2, §5.3; Philosophy §5 |
| R5 hiding (salted) commitments | §3 (append flow), §5.1 (`raw_content.salt`); Values §6 |
| R6 mutable private store | §5.1; Philosophy §5 |
| R7 ownership without exposure | §6 (private registration binding + opaque commitment, `identity/binding.ts`) |
| R8 anonymous or claim | §5.1 (`thread_keys.claimed`), §6 |
| R9 claim reversible | §5.1 (`claimed_at` nullable), §6 (`unclaimThread`) |
| R10 user self-audit receipt | §3 (append returns id/salt), §7 (`verifyBundle`) |
| R11 independent-org verification | §6 (selective reveal of binding openings, `revealThread`), §9 Q5 |
| R12 reconstruct all hashes | §7 (crypto exports), `verifier.ts` |
| R13 entry/block/record audit | §7, §8 (blocks) |
| R14 external anchoring | §8; Values §1–2 |
| R15 pluggable anchor target | §2 (`anchor/*`), §8, §9 Q1 |
| R16 offline verification | §4.1 (verifier consumes no connector), §7 |
| R17 minimal redaction | §5.1 (`redacted_at`), §10 Phase 1; FINDINGS §3 |
| R18 retain redacted privately | §5.1 (`raw_content` retained); FINDINGS §3 |
| R19 true erasure + tombstone | §5.1 (`erased_at`, null salt/content) |
| R20 auditor recompute good faith | §7 (`verifyBundle` reveal path), `verifier.ts` |
| R21 full data else proofs | §7 (bundle reveal vs hash-only) |
| R22 minimize proof-only | §5.1 (`redact`/`erase` are explicit, narrow) |
| R23 non-repudiation | §3 (signed envelopes), §8 (anchored) |
| R24 classify by tier | §5.1 (`kyc_attestations`) |
| R25 region/tier filtering | §5.1 (`kyc_attestations.region`, tier) |
| R26 signed filtered results (MVP trust) | §9 Q (filtering trust), Phase 2 |
| R27 decentralized KYC | §5.1 (`attestation_sig`), §9 Q; Values §8 |
| R28 build verification | contributor spec §3.5/§12.2 (platform-level) |
