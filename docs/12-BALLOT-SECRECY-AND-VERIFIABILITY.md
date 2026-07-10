# OurSay — Ballot Secrecy & Verifiability (Design Note)

_Why OurSay's self-audit model works for its **public, attributed** civic record but **cannot**, as built, carry a **secret ballot** — and what a secret-ballot mode would actually require. Internal developer documentation; full technical vocabulary. Companion to [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md), [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md), [`08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md) §5.5, and the audits under [`audits/`](./audits/)._

> **Status: design note — nothing here is implemented.** This document exists because the current record model quietly assumes votes stay **openly attributable** (public/pseudonymous), and no doc previously stated what changes when a jurisdiction demands a **secret** ballot. It is **normative direction** for that future, not a description of shipped code. Where it constrains a future claim, treat the gap as work to do — and, more importantly, as a claim we must **not** make until the work exists.

---

## 1. The one-sentence problem

**A self-audit receipt that lets *you* prove your vote was recorded correctly is, by construction, a receipt a *coercer* can demand.** OurSay's public record is built on **commitment openings** — reveal `(content, salt)`, anyone recomputes the hash, everyone is convinced. Openings are **transferable by design**; that is exactly the property a secret ballot must destroy. So the mechanism that gives individual verifiability for a public action becomes a vote-buying / coercion receipt the moment the action is a *secret* choice.

This note separates the guarantees so we never conflate them, shows where the current design is safe, shows precisely where it breaks, and specifies the restructure a secret ballot needs.

---

## 2. Six properties — keep them distinct

Three kinds of **verifiability**:

| Property | Plain English | OurSay today |
|---|---|---|
| **Recorded-as-cast** | My action, as I submitted it, is in the record. | ✅ per-thread signature + commitment (R2, R10) |
| **Counted-as-recorded** | The published total correctly sums the recorded actions. | ✅ recomputable offline from the anchored bundle (R12–R16) |
| **Cast-as-intended** | The action actually encodes what I meant (not silently altered by a compromised client). | ❌ not addressed (needs a challenge/audit ceremony) |

Three kinds of **secrecy**:

| Property | Plain English | OurSay today |
|---|---|---|
| **Ballot secrecy** | No one can tell how I voted. | ❌ the record is public/attributed **by design** |
| **Receipt-freeness** | I *cannot prove* to anyone how I voted, even if I want to. | ❌ openings are transferable proofs |
| **Coercion-resistance** | I cannot prove it even under active pressure (coercer watches, demands credentials/secrets, buys my vote). | ❌ and hardest of all for remote voting |

The secrecy column is empty on purpose: OurSay is an **auditable civic record**, where a verified action is *meant* to be publicly attributable to a persona. The tension in this note only appears when a jurisdiction bolts a **secret-ballot** requirement onto that public substrate.

---

## 3. Where the current model is exactly right

For **public / attributed** civic actions — statements, petition signatures, public polls, and any **openly-attributed referendum** — commitment-opening self-audit is not just acceptable, it is the correct design and OurSay already does it well:

- Nothing was ever secret, so revealing `(content, salt)` to let a participant confirm "my signature landed in the official count" **loses no secrecy** — there was none to lose.
- Individual verifiability (R10) and universal recomputation (R12–R16) hold, and the participant's proof being *transferable* is a feature (they can show a third party their action is in the record).

**A proposed "Elections Alberta results post" fits here perfectly — as long as the vote is attributed.** An official-role account (e.g. an electoral authority) publishing a signed `result` record, against which each participant opens their per-thread salt to locate their own entry, is a clean extension of the existing censored-record verification path. It is a genuine, shippable feature for **attributed** votes.

> **The fork in the road is a policy question, stated honestly:** is this vote **attributed** (the public may, in principle, see that persona *P* voted a certain way) or **secret** (no one may)? The current machinery serves the first. It **cannot** serve the second. Choosing "attributed" for a referendum is a legitimate option — but it is a *different thing* from a secret ballot and must never be labelled as one.

---

## 4. Why the hash-identity + released-salt scheme is a receipt

Consider the specific proposal: an election `result` post carries, per elector, `H(identity, salt)`; the platform holds `salt` and **releases it to the elector** so they can recompute the hash offline and "see where their vote landed in the official count." Trace the consequences:

1. **If the artifact binds identity → choice** ("see where their vote landed" implies choice-level), then `(identity, salt)` is a **complete, universally checkable proof of how a named person voted.** A coercer demands the salt (identity is already known), recomputes the hash, reads the row. Because the elector can trigger the salt release themselves, the coercer simply makes them do it. Withholding is not a capability the elector controls. **Receipt-freeness and coercion-resistance both fail.**
2. **If the artifact only proves inclusion** (a ballot from this elector was counted, choice not revealed), secrecy of the *choice* survives — but then it does **not** let the elector confirm their vote was counted *for the option they chose*, so it fails **recorded-as-cast** for a secret choice. The platform could substitute the choice undetectably.

There is no setting of this primitive that gives recorded-as-cast for a *secret* choice **and** receipt-freeness, because a commitment opening is inherently transferable. The analogy to censored-content verification is the trap: for content we *want* the opening to convince third parties; for a secret vote that is the exact property we must not provide.

> **Restated as a rule (what this design forbids):** _Never publish, or release to the voter, an opening that binds a voter identity to a plaintext vote choice in a vote declared secret._ Doing so manufactures a coercion receipt regardless of who "ran" the election. Routing it through an electoral authority's official account does not change this: if OurSay distributes the openings, OurSay is the receipt channel.

---

## 5. What a secret-ballot mode would actually require

The goal (verifiable **and** secret) is not impossible — end-to-end-verifiable (E2E-V) election systems (Helios, ElectionGuard, Prêt à Voter, STAR-Vote) achieve individual + universal verifiability *with* ballot secrecy. But they are structurally different from OurSay's opening-based model in one decisive way, and adopting them is a **restructure, not a parameter change**.

**The load-bearing difference:**

> The voter's self-check must point at their **encrypted** ballot (a *tracker*), and must **never** open the plaintext choice. Inclusion is provable; the choice is not openable by anyone — including the voter, to a coercer.

A minimally-faithful secret-ballot mode would need all of:

1. **Encrypted ballots.** The choice is encrypted on the device under an election public key; the record commits to the **ciphertext**, not a choice-revealing hash. The voter's receipt is a tracker locating their ciphertext on the board — the analog of a redacted entry's hash-only inclusion, but now the "withheld" content is the vote itself and stays withheld *forever*.
2. **Threshold-trustee tally.** No single party can decrypt an individual ballot. A **threshold** of independent trustees (candidates for the reserved consortium `attestations` role — see [`07-DECENTRALIZATION-ALIGNMENT.md`](./07-DECENTRALIZATION-ALIGNMENT.md)) jointly produce the result via **homomorphic aggregation** (sum the ciphertexts, decrypt only the total) or a **verifiable mixnet** (shuffle-then-decrypt with a public proof of correct shuffle). Universal verifiability comes from the tally proof, not from opening individual ballots.
3. **Cast-as-intended ceremony.** A Benaloh-style challenge (spoil-and-audit a ballot to confirm the client encrypted the intended choice, then re-cast) to defeat a compromised client — otherwise secrecy is preserved but *integrity of intent* is not.
4. **Non-transferable individual proof.** Any proof shown to the voter that their ballot is well-formed must be **designated-verifier** (simulatable by the voter, so it convinces only them) — the opposite of a commitment opening. This is what makes the self-check receipt-free.
5. **Eligibility without linkage.** Membership/uniqueness proven without publishing identity→ballot linkage — this is the natural home for **Method 4 (ZK membership credentials)** ([`08`](./08-IDENTITY-AND-DEVICE-POLICY.md) §5.5): a per-poll nullifier makes double-voting publicly detectable while the ballot stays encrypted and unlinkable across polls. The reserved envelope `proof` slot and `nullifier_attestations.membership_proof` are the existing hooks; today they are reserve-and-reject.

None of (1)–(5) exists in the repo. Method 4 is the only piece with a reserved schema slot, and it covers **dedupe/eligibility**, not the encryption/tally/receipt-freeness machinery.

---

## 6. The residual limit even after the restructure: remote coercion

E2E-V gives verifiable-and-secret, but it does **not**, by itself, give **coercion-resistance for remote voting**. In-person voting's coercion resistance comes from the **booth** — a guaranteed moment where the voter is provably alone and cannot be observed or compelled in real time. Remote voting has no booth. Even a perfectly receipt-free scheme can be defeated by a coercer who watches over the shoulder, demands credentials before/after, or buys them.

The known mitigations are all costly and none is deployed at national scale with strong guarantees:

- **Re-voting / vote updating** (Estonia model): the last vote counts; a coerced voter re-votes later in private. Requires a genuinely unobserved later moment.
- **Fake / panic credentials** (JCJ / Civitas): the voter hands a coercer a credential that produces a real-looking but uncounted ballot. Powerful in theory; poor UX, complex, not proven at scale.
- **In-person fallback / supervised kiosks** for coercion-prone contexts.

This is why Helios-class systems explicitly state they are for **low-coercion** elections. It is also the hard wall behind the future-state audit's position that "conceivable federal online ballot" stays **gated**: the record layer can be made excellent, and the endpoint + booth problem still is not solved.

---

## 7. Decision framework — pick the mode per vote, and label it truthfully

| Vote type | Secrecy requirement | Correct OurSay mode | Self-audit receipt | Status |
|---|---|---|---|---|
| Statement / petition signature / public poll | None (attributed by design) | Current opening-based record | Transferable opening — fine | ✅ shippable |
| **Attributed** referendum (public may see how a persona voted) | None | Current model + official `result` post + per-thread salt release | Transferable opening — fine | ✅ shippable (needs the `result`-by-official path + external anchoring) |
| **Secret** ballot (how-you-voted must be private) | Ballot secrecy + receipt-freeness | E2E-V restructure (§5) | Tracker to ciphertext only — **never a choice opening** | ❌ unspecified, unbuilt; research + institutional track |
| Coercion-prone secret ballot (e.g. binding electoral use) | + coercion-resistance | E2E-V + re-voting / booth fallback (§6) | As above, plus coercion mitigations | ❌ open problem at scale |

**What we must never claim** (extends the discipline of [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md)):

- Never call an **attributed** vote a "secret ballot."
- Never present a **choice-revealing** self-audit receipt as compatible with ballot secrecy.
- Never claim **coercion-resistance** for a remote vote without an implemented, audited mitigation.
- Never imply electoral-authority endorsement or that residency/eligibility verification equals a certified ballot (`docs/01` §4.6, §13.3).

---

## 8. Proposed requirement stubs (for a future secret-ballot workstream)

Non-binding until reviewed into [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md); recorded here so the workstream has a spine.

- **B1 [Invariant, when secret mode is offered]** — In a vote declared secret, no artifact published or released to any party MAY bind a voter identity to a plaintext choice.
- **B2 [Invariant]** — A voter's self-verification in secret mode MUST be non-transferable (designated-verifier), proving inclusion of their **encrypted** ballot only.
- **B3 [Invariant]** — Decryption of any individual ballot MUST require a threshold of independent trustees; the platform alone MUST NOT be able to decrypt a ballot.
- **B4 [MVP-of-secret-mode]** — The tally MUST be universally verifiable from the published ciphertexts via a public proof (homomorphic tally proof or verifiable shuffle), without opening individual ballots.
- **B5 [MVP-of-secret-mode]** — A cast-as-intended ceremony (challenge/spoil) MUST be available.
- **B6 [SHOULD]** — Where coercion is in scope, a mitigation (re-voting or supervised fallback) SHOULD be provided, and its limits disclosed.
- **B7 [Invariant]** — Public copy MUST distinguish "attributed auditable vote" from "secret ballot," and MUST NOT claim coercion-resistance absent an implemented mitigation.

---

## 9. Summary

OurSay's opening-based self-audit is the **right** design for its public, attributed civic record — including an attributed referendum with an electoral-authority `result` post. It is the **wrong** primitive for a secret ballot, because a commitment opening is a transferable receipt and a secret ballot must have none. Making a vote *secret and verifiable* requires a different construction (encrypted ballots, threshold-trustee tally, tracker-not-choice receipts, designated-verifier proofs), of which only ZK eligibility/dedupe (Method 4) has an existing hook; and even that leaves **remote coercion** unsolved. The honest ceiling remains: OurSay can deliver an **auditable, hard-to-forge, recomputable** civic record and, at the top tier, trustless residency — not a certified, secret, coercion-resistant ballot. The value is in stating exactly where that line is and never stepping over it in public.

---

_Related: [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md) (trustless vs. trusted), [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) (re-identification), [`08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md) §5.5 (Method 4 ZK), [`audits/2026-07-FUTURE-STATE-AUDIT.md`](./audits/2026-07-FUTURE-STATE-AUDIT.md) (election-grade bar), [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) (R10/R11/R27)._
