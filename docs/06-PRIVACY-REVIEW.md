# OurSay — Privacy Review

_What information OurSay may disclose to each audience, the privacy shortcomings of a genuinely
public record, and the mitigations — including per-governmental-level key compartmentalization.
Internal developer documentation; full technical vocabulary. Companion to
[`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md)._

> The guiding tension: the **signed record is meant to be public** (that is what makes it
> auditable), but the **link from a record to a real person** must stay protected. Privacy work
> targets that link and the **geographic exposure** that can reconstruct it — not the signed data
> itself.

---

## 1. Disclosure matrix — the MOST each role may receive

| Audience | May receive | Never receives |
|---|---|---|
| **Public** | The full **anonymized signed record** + the platform's signed attestation (audit anything); aggregate counts by area / tier; **complete copies** to keep for accountability. | Account/identity link, xPub, address, raw PII. |
| **Media** | Everything the public gets, plus a read-only public API (post-launch) for dashboards and analysis. | Same as public. |
| **Representatives** | Everything the public gets, **plus riding-filtered views** of comments/reactions for their area. | Account/identity link, xPub, address mapping — **no per-user proof**. |
| **Independent auditors** | Full record copies + verification tooling; KYC **attestation signatures** where a provider supports them; **level-scoped** identity disclosure **only with the user's authorization**. | Anything a user has not authorized; cross-level linkage. |

Key point: there is **no "counts-only" tier** — the signed record is public to everyone. What
differs by role is only **riding-filtered convenience views** (representatives) and **user-authorized
disclosure** (auditors). The protected secret is always the **identity link**.

---

## 2. The core privacy shortcoming — re-identification by inference

Because the signed record is public, the one thing standing between an action and a name is the
**account/identity link** we hold privately. That link can be **inferred** without us, for a narrow
but real class of users:

- A user who goes **fully public** (riding exposure on their profile) and posts/votes **heavily**
  across many issues leaks a behavioural fingerprint.
- If they also expose **riding data across government levels** (municipal / regional / provincial /
  federal), an observer can **triangulate**. Near **3+ overlapping boundary lines**, and as boundary
  definitions **change over time** (adding independent data points per redraw), accumulated
  constraints can **pinpoint an address**.
- The **xPub is the linkability vector**: a single account-level extended public key ties *all* of a
  user's per-thread keys together. Disclosing one xPub exposes a user's entire history under it, and
  it is therefore **PII**.

This is not a flaw in the cryptography; it is the unavoidable cost of letting individuals be both
**publicly expressive** and **verifiable**. We cannot fully eliminate it for users who choose maximal
public exposure — we can reduce it and make the trade-off explicit.

---

## 3. Mitigations

- **Default to minimal exposure.** Identity stays off the public record by default; anonymous
  participation still counts in verified totals.
- **Warn at the decision point.** When a user chooses to "go fully public," surface a clear,
  specific warning about cross-issue and cross-level re-identification — at the moment of the choice,
  not buried in a policy.
- **Coarse geography by default; advise against fine-grained riding exposure.** Strongly discourage
  publishing precise riding data across levels; prefer the coarsest area that serves the purpose.
- **Minimum-aggregation (k-anonymity) thresholds.** Do not render an area × tier breakdown until the
  bucket exceeds a minimum count, so small intersections can't isolate an individual.
- **Limit cross-level correlation and query resolution.** Rate-limit and aggregate queries; cap how
  finely results can be sliced by overlapping boundaries.
- **xPub hygiene.** Encrypt xPub at rest, **never publish it**, and disclose only with explicit
  user authorization — and even then, level-scoped (below).

### 3a. Per-governmental-level key compartmentalization
A structural mitigation, not just policy. Give each user a **separate account key (xPub) per
governmental level** — municipal, regional, provincial, federal, … — derived as **independent
hardened BIP32 branches** from their master secret (extending the path scheme prototyped in
[`../turnkey-test`](../turnkey-test) with a level index). Because **hardened siblings are mutually
unlinkable**, possessing one level's xPub reveals **nothing** about the others.

- **Level-scoped disclosure.** A resident proving their record to a federal body shares only the
  **federal** xPub — exposing federal-level activity only, never municipal/provincial.
- **Collusion-resistant.** Even if multiple governing bodies pool the xPubs they each legitimately
  hold, they **cannot** link a user's activity across levels or reconstruct a single identity.
- **Reduces triangulation.** A colluding set sees at most **one level's** activity per xPub it holds,
  which blocks the cross-level boundary-overlap attack described in §2.
- **Honest limit (helps, not solves).** Within a *single disclosed* level, that level's activity is
  visible **by design** (that is the point of disclosing it), and fine-grained area exposure at that
  level still carries residual risk. Compartmentalization must be combined with the §3 mitigations.

> Status: this is an **identity-phase derivation-scheme decision**, documented here; it is not
> implemented in the current build.

---

## 4. The representative "proof" question — resolved

Representatives understandably want to *prove* the sentiment they're shown is real. The resolution:

- They already get the **full anonymized signed record + attestation** — they can audit that the
  actions are real, distinct, and verified, and recompute any total themselves.
- They get **riding-filtered views** for their area.
- They do **not** get the **identity link** (keys-to-people, xPub, or address). Handing that over
  would compromise constituents' privacy and still would **not** be independently verifiable without
  each user's xPub anyway.
- **Trustless geographic attribution** — the genuine remaining want — comes from an
  **electoral-authority integration** (see [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md) §4), **not**
  from giving representatives per-user identity.

So: maximum useful disclosure to representatives, zero erosion of the identity boundary.
