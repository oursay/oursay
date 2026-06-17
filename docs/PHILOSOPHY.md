# OurSay — Monorepo Philosophy

_How this repository is organized, why it is one repository, and how a piece of code
travels from a throwaway experiment to civic infrastructure people rely on. This document
governs structure and process. For the engineering principles that govern **design
decisions inside** that structure, see [`VALUES.md`](./VALUES.md). For what the platform
does and why, read [`01-CONTRIBUTOR-SPEC.md`](./01-CONTRIBUTOR-SPEC.md) first._

---

## 1. Why a monorepo

OurSay is one product made of parts that must agree byte-for-byte. The frontend, the
backend, the public ledger writer, and the **independent audit tooling that anyone can run
without our servers** must share the exact same definitions of a commitment, a canonical
envelope, a Merkle leaf, and a hash. If a verifier and a producer disagree about how to
serialize a single field, every proof breaks silently. That shared, load-bearing
agreement is the whole reason the repository is unified.

A monorepo gives us:

- **One source of truth for shared crypto and schemas.** Canonical JSON, commitment
  construction, and Merkle math are defined once and imported everywhere. A producer
  cannot drift from a verifier because they are the same code.
- **Atomic cross-cutting changes.** A change to an envelope shape updates the writer, the
  reader, the exporter, and the verifier in a single reviewable commit.
- **Auditability as a first-class property.** The spec promises that "the audit tools are
  in this repository and work without our servers." That is only true if the tools and the
  thing they audit live together and are versioned together.
- **One license boundary.** Everything here is GPL/AGPL civic infrastructure (see the
  README). A single repository makes the license obligation unambiguous for every fork.

We accept the monorepo's costs — coarser access control, a larger clone, the discipline of
keeping workspaces decoupled — because the alternative is the thing we cannot tolerate:
producer/verifier drift in a system whose entire value proposition is "don't trust us,
verify."

---

## 2. The workspace model

The repository is an **npm workspaces** monorepo (`package.json` → `workspaces`). Each
workspace is a directory with its own `package.json`, named under the `@oursay/*` scope
(`@oursay/immudb-test`, `@oursay/public-record`). Node ≥ 20. Dependencies are hoisted to
the root; the root `package-lock.json` is the single locked dependency graph.

Every workspace falls into one of three kinds. The kind determines what is expected of it.

### 2.1 Product workspaces

The deployable application(s). Today: `site` (the Astro frontend). A product workspace is
something we ship to users; it carries the full weight of the spec — accessibility, the
non-affiliation disclaimer, public-language discipline, build-hash publication.

### 2.2 Evaluation workspaces (spikes)

Time-boxed, hypothesis-driven investigations that answer a small number of sharp questions
with **tests as evidence**. Today: `turnkey-test` (can we provision per-user HD wallets and
derive per-thread keys?) and `immudb-test` (is immudb a viable tamper-evident ledger, and
how do redaction and anchoring actually behave?).

An evaluation workspace is **honest about being a spike**:

- Its name ends in `-test` and its `description` says "evaluation."
- It pins whatever versions make the experiment _genuine_ even if they are not what we
  would deploy. (`immudb-test` pins immudb 1.1.0 to exercise real gRPC proofs as a
  baseline, while explicitly recommending 1.11.0 for production — see its FINDINGS.)
- It produces a **`FINDINGS.md`**: the durable output. The code may be thrown away; the
  findings are not. They are the input to the next phase.
- It is never imported by a product or library workspace. Spikes are leaves in the
  dependency graph.

> An evaluation workspace's job is to retire risk and write down what was learned, not to
> become the production system by accretion. When it has answered its questions, it stops.

### 2.3 Library workspaces

Production modules that real code depends on. `public-record` (proposed) is the first.
A library workspace graduates from one or more spikes: it takes the validated approach,
drops the baselines and scaffolding, and presents a clean, documented public surface that
product workspaces and audit tooling import.

A library workspace is held to a higher bar than a spike:

- A documented, intentional **public API** (its package `exports`), distinct from internal
  modules.
- Stable schemas and versioned wire formats (envelopes carry `v`).
- Tests that assert the **security properties**, not just the happy path (tamper is
  rejected; redaction preserves verifiability; salts hide low-entropy content).
- No secrets, ever — enforced by `.gitignore` and review.

---

## 3. How code graduates: spike → findings → proposal → library

This is the central process of the monorepo. New, risky capability does not arrive as a
big PR into a product workspace. It travels a path:

```
  spike (·-test)  ──►  FINDINGS.md  ──►  PROPOSAL.md  ──►  library workspace  ──►  product use
  retire the risk      write it down     design review     stable surface         import it
```

1. **Spike.** Stand up an evaluation workspace. Prove or kill the idea with tests. Pin
   whatever makes the test _real_.
2. **Findings.** Write `FINDINGS.md`: what is true, what is false, what surprised us, what
   the production path is, and what to explicitly _not_ do. This document outlives the code.
3. **Proposal.** Before building the library, write a `PROPOSAL.md` in the target workspace
   that defines modules, schemas, and public exports, and cites the findings. Significant
   design decisions get reviewed here — cheaply, in prose — before code exists. (Section
   15 of the contributor spec: "for significant design decisions, open an issue or RFC
   before writing code.")
4. **Library.** Build the workspace to the proposal. Promote shared primitives (canonical
   JSON, commitments, Merkle) from the spike rather than reinventing them. Delete baselines
   the spike only needed to prove a point.
5. **Product use.** Product workspaces and audit tooling import the library's public API.

The artifacts are cumulative: a finding can be wrong later, but you can always trace _why_
a decision was made back through proposal → findings → the test that produced it.

---

## 4. Dependency direction

Decoupling is what keeps a monorepo from collapsing into a tangle. The rules:

- **Product → library → shared primitives.** Dependencies point one way, toward greater
  stability and generality.
- **Nothing depends on an evaluation workspace.** Spikes are sinks, never sources.
- **Audit tooling depends only on shared primitives and public schemas** — never on server
  code, server config, or anything that would require running OurSay to verify OurSay. The
  offline verifier must keep working with nothing but a published bundle and an
  externally-anchored root.
- **Crypto and schema live at the bottom.** Canonical JSON, commitment construction, and
  Merkle math are the most-depended-on, least-changing code. They change rarely and only
  with overwhelming care, because every proof in the system rides on them.

---

## 5. Separation of concerns: the public ledger vs the private store

One architectural decision is so foundational it is monorepo philosophy, not just a
library detail (the immudb spike established it; see `../immudb-test/FINDINGS.md`):

**The append-only public ledger holds only hash commitments and public metadata. A
separate, mutable private store holds raw content and PII.**

This split is non-negotiable and shapes how every workspace is allowed to handle data:

| | Public ledger (append-only) | Private store (mutable) |
|---|---|---|
| Holds | commitments + public envelope metadata | raw content, salts, PII, keys, KYC |
| Mutability | append-only — a feature | mutable / erasable — a requirement |
| Anchored externally? | yes | no |
| Why | tamper-evidence, public auditability | redaction, true erasure, right-to-be-forgotten |

PII and raw content **must never** be written to an append-only ledger, because an
append-only ledger can never delete — which is incompatible with redaction and erasure
obligations. Any workspace that touches user data inherits this boundary.

---

## 6. Trust lives in anchoring, not in any component

A recurring temptation is to believe that adding a verifiable database makes the operator
trustless. It does not. The immudb spike proved that server-side or first-contact
verification still trusts the operator's own root.

**The monorepo's trust root is the externally-anchored Merkle root — published to
infrastructure we do not control — plus the offline verifier that checks published data
against it.** Individual components (a verifiable ledger, gRPC proofs, server-side verify
functions) are valuable defense-in-depth, but none of them is _the_ trust anchor. This is
why audit tooling is held apart in the dependency graph and why anchoring is treated as
required regardless of transport. Design every workspace so that removing OurSay's servers
from the picture still leaves the public able to verify.

---

## 7. Public vs internal language

The platform's public-facing surfaces and internal developer materials use **different
vocabularies**, deliberately (contributor spec §11.5):

- **Internal docs and code** (this file, FINDINGS, proposals, source) may freely say
  blockchain, EVM, Solana, wallet, keypair, on-chain, Merkle, anchor.
- **Public-facing surfaces** (the `site` workspace, user copy, the public API) say
  "distributed public database," "public audit ledger," "cryptographically verifiable
  public record" — never the internal terms.

The boundary runs along workspace lines: product workspaces enforce public language;
library and evaluation workspaces are internal and speak plainly.

---

## 8. Conventions

- **Naming.** Workspaces are `@oursay/<name>`; evaluation workspaces end in `-test`.
- **Module style.** ESM (`"type": "module"`), NodeNext resolution, TypeScript.
- **Canonical JSON is sacred.** Any code that hashes or proves must use the one shared
  canonicalizer. Never hand-serialize a structure that will be hashed.
- **Versioned wire formats.** Anything published or anchored carries a `v` field so
  formats can evolve without breaking historical verification.
- **Config via env with safe defaults.** Workspaces read a root `.env` then a local `.env`
  (local overrides). Defaults match the committed `docker-compose.yml` so a fresh clone
  runs without secrets. `.env.example` documents overrides.
- **Findings and proposals are deliverables.** A spike without a `FINDINGS.md` is
  unfinished; a library without a `PROPOSAL.md` skipped a review step.
- **No secrets in git.** Ever. Not in a product workspace, not in a spike.

---

_This document describes how we organize and how code matures. The values that constrain
what we build — auditability, minimal trust, anonymity, censorship-minimalism,
reproducibility — are in [`VALUES.md`](./VALUES.md)._
