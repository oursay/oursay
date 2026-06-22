# OurSay — Trust Review

_An honest accounting of what a third party can verify **without trusting OurSay**, what still
rests on trust, and the roadmap to shrink the trusted base. Internal developer documentation;
full technical vocabulary is used freely here (see [`PHILOSOPHY.md`](./PHILOSOPHY.md) §7). The
public-facing summary lives on the site's `/transparency` page in plain language._

> Companion: [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) (disclosure matrix + privacy
> shortcomings). Worked design: [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md)
> and [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md).

---

## 1. Two guarantees — keep them separate

The platform makes two very different kinds of promise. Conflating them is the most common way to
over-claim, so we state them apart and hold every public claim to the line between them.

### (1) Trustless — verifiable without us
The **integrity of the record** and the **record itself** are independently auditable:

- Each action is stored as a **salted content commitment** (a cryptographic hash) — never the
  plaintext on the public record.
- Actions are linked in a **per-entity hash chain**; batches roll up into **Merkle roots** that are
  **anchored to external public infrastructure** (planned; the file-target anchor + offline verifier
  exist today — see `../public-record`).
- The **full signed record is anonymized and publishable**: each record (envelope) carries a
  per-thread P-256 action signature, a content fingerprint, its per-thread public key, and
  tier/region metadata — only `thread_pubkey`, **never the identity commitment**. None of it carries
  a name or a cross-thread link, and anyone can hold a complete copy and recompute every total. (The
  opaque per-thread commitments appear separately, in the settlement attestation metadata below.)
- Authorship, linkage, and the published set are **three separate proofs**: (1) the **action
  signature** proves authorship under a thread key; (2) a **private platform registration binding**
  proves the platform linked that key to one opaque account commitment at registration; (3) the
  **settlement attestation** proves the published verified set. Bindings shrink the linkage gap from
  "trust our database" to "verify our signed bindings."
- The platform publishes a **signed attestation** over the verified set — the Merkle root **plus
  per-envelope metadata (including the opaque commitments)**, referenced by `thread_pubkey` — so an
  auditor can confirm the list they are checking is provably the set OurSay stands behind (not a
  vague "verified account" flag).
- An **offline verifier** checks a single entry or a whole block against an independently obtained
  root — no platform API, no database, at verify time.

Everything above an auditor can confirm for themselves. We are **one custodian** of this record, not
its only holder and not its source of truth.

### (2) The one real trust gap — geographic attribution
What an auditor **cannot** independently confirm today is that a given verified action belongs to a
specific **geographic area (riding)**. The chain `per-thread key ↔ real person ↔ verified address`
is asserted by **OurSay + the identity-verification (KYC) provider**. The record proves a *distinct,
verified participant* acted (the verified flag is attested and auditable); it does **not**, on its
own, prove that participant *resides in riding X* in a way a third party can check without trusting
the provider.

> Honest footnote: distinctness / the "verified" determination itself ultimately also rests on the
> KYC provider (we trust it deduped a real, unique person). But the headline, user-facing gap — and
> the one most likely to be over-claimed — is **geographic/residency attribution**. That is the
> claim we deliberately distance on the site.

---

## 2. Authentication & write model

- The public record is **auth-based**: any **authenticated** user may write to it. Authentication is
  **pluggable** — email, phone, or social login — and selectable per region / governing body.
- A **Canadian carrier-based phone number** is the preferred factor where available: it is auditable
  by local authorities who already have established relationships with carriers, which raises the
  cost of large-scale fake accounts without adding a new trusted intermediary.
- Only **verified** users are tied to an identity (via the KYC provider), and only their actions are
  appended to the **public verified record** (signed, on-ledger). **Unverified** authenticated
  participation stays **off-record** — referenced off-chain per the contributor spec (§9.1), not
  written to the public verified ledger as a verified entry.
- Role-based views (representative / media / independent auditor) are derived from **public riding
  data only** — never from private identity.

Implication: write-access trust is "a real authenticated account," which is cheap; the *meaning*
attached to a write (verified, resident of riding X) is where the KYC trust enters.

---

## 3. What is attested vs. what is trusted

| Property | Who establishes it | Independently verifiable? |
|---|---|---|
| Record integrity (no tampering, inclusion, totals) | math + external anchor | **Yes** (offline) |
| The published verified set (Merkle root + per-envelope metadata, incl. opaque commitments) | platform **settlement attestation** (signed) | **Yes** (check the signature + record) |
| A thread key belongs to one verified account | platform **registration binding** (signed, private) | **Yes** against the platform key; the account stays opaque until selectively revealed |
| An action came from a distinct verified participant | KYC provider (attested tier) | Auditable as a signed list; the *verification itself* trusts the provider |
| That participant **resides in riding X** | KYC address check + platform | **No** (today) — the trust gap |
| Which real person an action belongs to | withheld (private) | No — and intentionally so (see Privacy Review) |

---

## 4. Roadmap to shrink the trusted base

1. **Electoral-authority integration** — the strongest fix: an official electoral body validates
   residency/eligibility, making geographic attribution **trustless** (a distinct, higher
   verification tier). This is the designed end-state for the geographic gap.
2. **Multi-provider KYC attestation signatures** — providers sign their attestations; a user verified
   by several independent providers is more strongly verified than one verified by several validators
   sharing a single provider. Reduces single-provider trust.
3. **Node attestations / multiple independent validators** — independent parties re-attest, so no
   single operator (including us) is the sole authority.
4. **User-authorized identity disclosure** — a resident may prove their own record to an independent
   organization (which does its own KYC) by **selectively revealing specific threads** (opening the
   per-thread binding for those threads only). This is **per-thread and jurisdiction-scoped** via
   separate jurisdiction master keys (see [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) §3a): a
   resident can prove chosen threads to one body without exposing other threads or activity in other
   jurisdictions. A
   **user-signed** binding makes this verifiable without platform cooperation.

Until (1)–(4) land, OurSay is explicit that geographic attribution rests on the platform + provider,
signed and in good faith, but not yet third-party-trustless.

---

## 5. Current shortcomings (state honestly)

- **Server-side verification today.** immudb's `verifyRow` runs server-side; the zero-trust property
  comes from the **external anchor + offline verifier**, which is built against a file target but not
  yet published to infrastructure we don't control. Until external anchoring ships, "verify without
  trusting us" is a design guarantee, not yet a live one.
- **Commitments reach the ledger at settlement, not on the action.** A civic action is first pooled
  in the mutable store; its commitment is written to immudb only when a **block is settled** (on a
  count/age trigger), and settled blocks are anchored externally as a separate step. So a just-taken
  action is durably recorded (pooled) but not yet ledger-committed or externally anchored until the
  next settlement/publish — a short, bounded window, not a gap in the eventual guarantee.
- **Signing not yet enforced.** Per-action digital signatures are designed and promised (rolling out
  before launch); they are stubbed in the current build.
- **Geographic attribution not independently verifiable** before an electoral integration.
- **The attestation is only as good as our key management.** The signed attestation proves the set is
  ours; it does not by itself make residency trustless.

These are tracked so public claims stay inside what is actually true at any given time.
