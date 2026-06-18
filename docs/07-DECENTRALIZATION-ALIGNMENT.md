# OurSay — Decentralization Alignment

_The north-star constraint for every design decision. OurSay runs as a single centralized
custodian today, but the goal is a record where **consensus is possible, not dictated by us** —
first a permissioned consortium of custodians (agencies, electoral commissions, vetted identity
validators), and ultimately an **open network where anyone who can validate identity, including
public auditors, can run a node** once it is secure enough to allow it. Everything we build now
must keep that leap cheap: a change of operators and quorum rules, not a rewrite of the record
model. Companion: [`VALUES.md`](./VALUES.md), [`PHILOSOPHY.md`](./PHILOSOPHY.md),
[`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md), [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md),
and [`../public-record`](../public-record)._

> This document does **not** ask us to build consensus, networking, or multi-node infrastructure
> now. It asks that nothing we build **forecloses** them. When a design choice would be cheaper
> today but harder to decentralize later, this doc is the tie-breaker: choose the
> decentralization-ready option unless the cost is real and the section §5 records why.

---

## 1. The progressive path (and where we are)

Decentralization is a path, not a switch. Each stage must be reachable from the previous one by
changing **who is authorized and how agreement is reached** — never by reshaping the record.

1. **Single custodian (today).** One operator writes; the record is already verifiable without
   trusting that operator (commitments + external anchor + offline verifier). This is the
   *centralized instantiation of a decentralizable model* — not a different system.
2. **Permissioned consortium.** A known validator set (custodians) proposes and **co-signs**
   blocks under BFT-style consensus with deterministic finality. "The platform signs" becomes "a
   quorum signs." Identity is the membership.
3. **Open / permissionless participation.** Anyone who can validate identity — including public
   auditors — may join as a node when Sybil-resistance and security gates (§6) are met. Validator
   admission is itself an on-record, identity-gated decision, not an operator privilege.

We build stage 1. We owe stages 2–3 the discipline below.

---

## 2. Prime directive

**No single operator is the source of truth — and the design must not assume one.** The public
promise today is "don't trust *us*"; the architectural target is "don't trust *any one node*." Every
guarantee should be reproducible by an independent party from shared, signed, content-addressed
data — which is exactly what a second node will need to agree with the first.

---

## 3. Design invariants (what every contribution must preserve)

Stated as constraints — each says what it **rules out**.

1. **The record is reconstructible and verifiable by anyone, from the shared log alone.** State is
   a deterministic fold over signed, content-addressed events. _Rules out_ state that depends on a
   node's local, non-reproducible, or privately-held data to be correct.

2. **Wall-clock time is metadata, never the ordering authority.** Canonical order is structural
   (block height + position within a block), established by agreement — not by timestamps, which
   are forgeable assertions and diverge across nodes. _Rules out_ any correctness or eligibility
   rule (deadlines, tie-breaks, "first") that trusts a clock as fact. (Timestamp+hash is acceptable
   only as a *local* mempool hint, never as the source of truth.)

3. **Every transaction is independently verifiable without trusting its writer.** Each carries the
   author's own signature over a canonical envelope; any node can validate it offline. _Rules out_
   "trust me, I recorded it" — including trusting the platform's own database row.

4. **Blocks are the unit of agreement, and the block header is consensus-ready.** Separate *what is
   committed* (the Merkle root over transactions — fixed) from *who attests it* (an extensible
   signature set: one custodian today, a quorum tomorrow) plus a proposer and a previous-header
   link. _Rules out_ baking a single-signer assumption into the header, the anchor format, or the
   offline verifier.

5. **Authority is a configurable role, never a hardcoded identity.** Anything "the platform does"
   (attest, update rules, anchor, redact) must be expressible as *an authorized actor performed an
   action* that could later become a role or a quorum. _Rules out_ `if (isUs)` backdoors and
   privileged operations that cannot be generalized to "an authorized validator / a quorum did X."

6. **Determinism and reproducibility end to end.** The same inputs yield the same hashes, roots,
   and folded state on any machine. _Rules out_ nondeterministic serialization, locale/float
   dependence, or projections that can disagree between nodes.

7. **The trust root is external and node-agnostic.** Verification rests on externally anchored
   roots + the offline verifier, not on any one backend (e.g. immudb's server-side check). _Rules
   out_ making a single storage engine the arbiter of truth.

8. **Portable and independently runnable.** A second operator can stand up a node from this repo
   and reach identical state. _Rules out_ hidden coupling to our specific infrastructure, secrets,
   or hosted services for correctness (telemetry/ops aside).

---

## 4. Decentralization-readiness checklist

Apply to every design and PR that touches the record, schema, crypto, anchoring, or authority:

- [ ] Could a **second independent node** reproduce this result from shared signed data alone?
- [ ] Does anything depend on **wall-clock time** for correctness, ordering, or eligibility?
- [ ] Is every new record **signed by its author** and verifiable without trusting the writer?
- [ ] If the platform performs a privileged action, is it modeled as **an authorized actor**
      (role/quorum-ready), not a hardcoded "us"?
- [ ] Is the serialization **canonical and deterministic** (same bytes/roots everywhere)?
- [ ] Does the block/anchor header leave room for **multiple signatures + a proposer** without a
      breaking change?
- [ ] If we took the cheaper centralized shortcut, is it recorded in **§5** with the migration path?

---

## 5. Centralization we accept today (and how each generalizes)

Honesty over aspiration — these are deliberate, temporary, and each has a known path out.

| Today (centralized) | Why it's fine now | How it decentralizes |
|---|---|---|
| One writer; per-entity `prevHash` assumes a single sequential writer | No contention with one custodian | Optimistic concurrency / BFT ordering; the per-entity chain still verifies per node |
| One signer attests the block / valid-record set | Single operator of record | Header's signature set grows to a custodian **quorum** (stage 2) |
| One proposer settles blocks on a local count/time trigger; a single `chainId` genesis | One custodian sets the settlement cadence; immudb is never reset, so blocks are keyed by `(chainId, height)` | The trigger becomes a proposer/quorum cadence under BFT; the age trigger stays *cadence only* (never ordering); `chainId` becomes an agreed, on-record, membership-gated genesis |
| `seq` is a single Postgres sequence | Global order is trivial locally | Order becomes block-relative (height + position), agreed by consensus |
| Platform key signs governance / rules updates | Operator governs | "Platform" becomes an on-record **validator role**, then a quorum vote |
| immudb `verifyRow` is server-side | Dev-stage witness | External anchoring + offline verifier is the node-agnostic trust root |

If you add a new centralization point, add a row here with its migration path.

---

## 6. Opening to public nodes — the security gates

Stage 3 (anyone can run a node) is unlocked by *evidence of safety*, not a calendar:

- **Sybil resistance via identity.** Node admission is identity-gated (the same KYC/identity spine
  used for verified users), so "one human, one say" survives open participation.
- **Byzantine fault tolerance.** A consensus rule that tolerates up to *f* malicious nodes of
  *3f+1*, with deterministic finality (a closed civic vote must never reorg).
- **Economic / reputational stake** where appropriate, to make misbehavior costly without
  re-introducing a central gatekeeper.
- **Validator membership recorded on the chain**, so who-may-participate is itself auditable and
  governed by the record — not by an operator's console.

Until those hold, opening the network would weaken the very guarantees decentralization is meant to
strengthen. The path is real; the gating is honest.

---

## 7. Scope discipline

- **Build now:** the centralized instantiation — single custodian, deterministic event-sourced
  record, content-addressed commitments, per-entity chains, batch anchoring with a consensus-ready
  header, per-transaction + per-block signing on the roadmap.
- **Keep open (do not build now):** consensus engine, peer-to-peer networking, view-change/leader
  rotation, validator admission protocol, stake/reputation. Designing *for* them is required;
  *implementing* them now is premature.

The test for any decision: **could OurSay make the leap by changing operators and agreement rules,
without reshaping the record?** If yes, we are aligned. If no, fix the design or record why in §5.
