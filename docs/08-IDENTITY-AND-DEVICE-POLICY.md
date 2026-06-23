# OurSay — Identity, Privacy & Device Policy

_What we are building for user identity, device signing, and privacy — in plain English.
Use this document when changing auth, user data, the public record, or client key handling.
It captures product intent from design review (June 2026) and should stay aligned with
[`01-CONTRIBUTOR-SPEC.md`](./01-CONTRIBUTOR-SPEC.md), [`VALUES.md`](./VALUES.md),
[`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md), and
[`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md)._

> **Status:** normative for product and engineering direction. Where this document and the
> running code disagree, treat the gap as work to do — not as permission to drift.

---

## 1. How to use this document

- **Before** adding user tables, passkey flows, or signing code, check Sections 2–6.
- **Before** changing thread registration, bindings, or nullifiers, check Sections 3–4, 5, and 8.
- **When** a trade-off arises (e.g. convenience vs. non-exportable keys), Sections 5–6 state
  which side we prefer.
- Technical requirements live in `public-record/REQUIREMENTS.md`; this document explains
  *why* in language stakeholders and new contributors can follow.

---

## 2. What a user has (identity model)

### Account vs. civic identity

- A **passkey** (or other auth factor) proves *who is logged in*. It does **not** sign
  civic actions directly.
- For each **jurisdiction** they belong to (e.g. `ab-ca-gov`, `ca-gov`; each carries a
  governmental *level* as a property — see docs/01 §6.0) the user has **signing material on
  their device** from which **per-thread keys** are produced.
- For each **thread** they join (a post, poll, or petition — the root of that conversation),
  they use a **thread key**: a pseudonymous public key that appears on the public record.

### Not one passkey per thread

Users do **not** register a new passkey for every thread. They authenticate once (or with
a small set of devices), then **register a thread key** the first time they participate in
that thread. The thread key is what signs comments, votes, reactions, and other record entries.

### One pseudonym per thread (default)

By default, all of a user’s actions in one thread should appear under **one thread public
key** — one pseudonym for that conversation. They stay anonymous to the public unless they
choose to link that activity to their real identity (see Section 4).

### Platform never holds private keys

The platform may store **public** keys and **private bindings** (proof that a key belongs to
a verified account, without publishing which account). It must **never** hold private signing
keys, derivation secrets, or anything that lets us sign on a user’s behalf.

We also avoid storing **wrapped private key blobs** on the server as a convenience — even
encrypted, that blurs the line of custody we want to keep clear.

---

## 3. Signing and the public record

### Every envelope is signed on the device

Every entry appended to the verified public record must be **cryptographically signed on the
user’s device** before it reaches the server. The server checks the signature, registration,
content commitment, and applicable rules — it does not sign for the user.

### Thread key scope

- A thread key is scoped to one **root thread** (the post, poll, or petition that started
  the conversation).
- Comments, votes, and reactions on that thread use the **same registered thread key** for
  that user (unless a deliberate multi-device policy applies — see Section 6).

### Singleton actions (votes, reactions, petition signatures)

Some actions are **one per person per target** (e.g. one vote per poll, one reaction per
comment). These use an opaque **nullifier** so anyone can confirm there is no double
counting without learning who voted twice.

- Nullifiers are tied to the **person** (via platform attestation to a verified account),
  not merely to a thread public key.
- If two devices could produce different nullifiers for the same user, we must still allow
  only **one** active singleton action per user per parent — the platform enforces one
  nullifier per `(user, parent)`.

### What can be edited (Alberta / default product rules)

Under default rules (including the Alberta launch intent):

| Kind | Create | Change | Delete / revoke |
|------|--------|--------|-----------------|
| Posts, comments, reactions | Yes | Yes | Yes (author-only) |
| Votes | Yes | Only if the poll allows it, before deadline | No |
| Petition signatures | Yes | No | Only if the petition allows revoke, before deadline |

Different jurisdictions may tighten or relax these via **per-entity or per-deployment
rules** in future; the platform should support configuration, not hard-code one province forever.

---

## 4. Privacy and linkability

### Anonymous by default

Participation in a thread is **pseudonymous on the public record**. Published envelopes
carry a thread public key and signature — not a name, user id, or cross-thread link.

Nothing public — not the nullifier, not the envelope, not settlement metadata — should
let an outsider connect one user’s activity **across different threads** without
authorization.

### The link exists privately — and users may prove it

“Private linkability” means the mapping **account ↔ thread key** is **not published by
default**. It does **not** mean users can never prove they wrote something.

Users must be able to:

- **Self-audit** — show that their copy of an action matches the public record.
- **Claim ownership** (future) — publicly say “this thread’s activity is mine,” reversibly.
- **Selectively reveal** (future) — authorize a specific third party (e.g. Elections Alberta,
  a court, an auditor) to verify **specific threads only**, without exposing all their activity.

Until claim and selective-reveal flows are built, proof to a third party may require manual
cooperation; the **design intent** is user-controlled disclosure, not permanent anonymity
and not platform-only disclosure.

### Residual risk (honest limit)

Heavy public activity plus fine-grained geographic exposure can allow **inference** about
who someone is. That is a product and UX problem, not something we fix by putting identity
on the ledger. See [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md).

---

## 5. Target architecture (greenfield review)

_This section records a structured design review (June 2026) **without** tying choices to the
current codebase. It defines where we want to end up and how to get there. Use it when planning
user strategy, auth, and record wire formats._

### 5.1 What we are trying to achieve

| Goal | Plain English |
|------|----------------|
| **User is the boundary** | One verified person → one vote per poll, one logical author per thread, no matter how many devices they own. |
| **Anonymity per thread** | The public record shows a **thread-scoped identifier**, not a global account id and not a link across threads. |
| **Verifiable signatures** | Anyone can check: this message was signed, with this content hash, at this time. |
| **Auditor: vote ↔ thread identity** | An auditor can confirm “this vote was cast by public identifier *P* in thread *T*” (pseudonym in that thread — not necessarily the voter’s real name). |
| **No double voting** | Publicly checkable: the same person did not vote twice on the same poll. |
| **No boundary farming** | A user cannot legitimately spawn extra identities within the same jurisdiction/thread rules to multiply votes or comments beyond policy. |
| **Multi-passkey / multi-device** | Several hardware-backed keys per account; any enrolled device may sign. |
| **Cross-device editing** | A message signed on phone A may be edited with a valid signature from phone B when both belong to the same user. |
| **Hardware-backed signing** | Private keys stay non-exportable on device; platform never holds signing keys. |

### 5.2 Three layers (keep these separate)

Every viable design separates:

```text
Human (verified account)           ← “one person, one vote” boundary; KYC; device enrollment
        ↓  private / attested link
Thread persona (public id in T)    ← “who wrote this in this thread” on the record
        ↓  public signature
Message / vote envelope            ← what auditors verify on the chain
```

**Device keys** sit between human and persona: they **act for** the persona but are not
necessarily the same as the persona’s public key on the ledger.

### 5.3 Approaches considered

| # | Approach | Summary |
|---|----------|---------|
| **1** | Platform-attested device registry + stable thread persona | Many device keys *Dᵢ* per user; one thread persona *Pₜ* per (user, thread); platform privately links `Dᵢ → user → Pₜ`. Dedupe via user-level nullifier registry. |
| **2** | Thread persona key synced via passkey ecosystem | One non-exportable *Pₜ* per (user, thread), shared when the OS syncs the same passkey (e.g. iCloud). Simplest public story; weak for independent passkeys. |
| **3** | Per-(user, jurisdiction) nullifier root + many device keys | **Recommended build direction** (see §5.4). Device keys sign; stable *Pₜ* is author on record; the nullifier root is per **(user, jurisdiction)** so all of a user's devices share dedupe semantics within a jurisdiction. Cross-device edit authorized by **user**, verified by **any enrolled device signature**. |
| **4** | Anonymous credentials / zero-knowledge membership | **Permanent ideal goal** (see §5.5). After KYC, user holds a credential; votes/actions include ZK proofs of membership + unique nullifier per poll; minimal platform trust for dedupe. |
| **5** | Published on-chain device authorization graph | ~~Publish which device keys may act for which thread persona.~~ **Ruled out** — see below. |

**Method 5 — ruled out.** Publishing a graph of device public keys authorized across threads
creates a **cross-thread correlator**: the same device key appearing in two threads lets an
observer link activity across those threads without user consent. Any design that puts a
stable device-level identifier on the public record (or in widely replicated settlement
metadata) in more than one thread is **not viable** for OurSay. Cross-device authorization
must stay **private**, **thread-scoped**, or **user-initiated reveal** — never a global
device fingerprint on the ledger.

### 5.4 Recommended build direction: Method 3

**Use Method 3 when implementing user strategy and the first production auth path.**

Concrete rules:

1. **Verify once** → human record (KYC tier, geographic areas).
2. **Enroll device** → hardware-backed key *Dᵢ* (passkey / secure enclave) linked to user;
   many passkeys per account allowed.
3. **Join thread** → allocate stable thread persona *Pₜ* (public author id for that thread);
   register with platform; *Pₜ* must not be derivable across threads by public observers.
4. **Post comment** → envelope carries `author = Pₜ`, `signer = Dᵢ`, signature; no nullifier.
5. **Vote / singleton action** → same, plus opaque **nullifier** *N* unique per (user, poll);
   chain rejects duplicate *N* on the same parent; any enrolled *Dᵢ* for that user reuses *N*
   to change a vote when rules allow.
6. **Edit / delete** → allowed when governance permits and **signer** is any *Dᵢ* registered
   to the **same user** as the original author (not necessarily the same device that created
   the entity).
7. **Reveal identity** (optional, future) → user-controlled opening linking *Pₜ* to real-world
   identity for chosen threads only (R11).

**Why Method 3 first**

- Satisfies multi-passkey, hardware signing, cross-device edit, and user-level dedupe without
  cloning one private key across phones.
- Auditors verify signatures, `author = Pₜ`, and nullifier uniqueness on polls.
- Wire format can reserve fields later needed for ZK presentations (§5.5).

**Sacrifices accepted on the way to Method 4**

- Nullifier consistency across devices requires a **per-(user, jurisdiction) nullifier root** —
  issued once at verification, derived from a primary passkey PRF, or synced via user-controlled
  encrypted backup — not independent per-device roots for singleton actions. Keying by jurisdiction
  (not by governmental level) keeps singleton dedupe independent across same-level jurisdictions.
- “One person one vote” still trusts **KYC + platform nullifier attestation** until ZK
  replaces that slot.
- Envelope may carry both **author** (thread persona) and **signer** (device key) — slightly
  richer than a single pubkey, but device pubkeys must **not** be reused as cross-thread linkage
  on the public record.

### 5.5 Permanent ideal goal: Method 4 (zero-knowledge credentials)

**Product direction:** treat **anonymous credentials / ZK membership proofs** as the
**long-term target**, not an optional enhancement. Method 3 is the **compatible on-ramp**;
Method 4 is what we build toward when investing in user strategy and cryptography.

**Shape of the end state**

- After verification, the user holds a **credential** (e.g. BBS+ or equivalent) attesting
  membership in a defined set (“verified residents of …”) without revealing which member they
  are on each action.
- To vote on poll *P* in thread *T*, the client publishes a **zero-knowledge proof** showing:
  - the credential is valid and not revoked,
  - a **nullifier** unique to *(credential, P)* so double voting is **publicly** detectable
    without trusting the platform’s database,
  - optional binding to thread persona *Pₜ* so auditors tie the vote to the public identifier
    in that thread.
- **Multiple devices:** each enrolls *Dᵢ*; credential material is **re-provisioned** or
  **split** per device via blind issuance — without publishing a device graph that links
  threads (avoid Method 5 failure mode).
- **Cross-device edit:** proofs or signatures show authorization under the same **user /
  credential subject**, not the same device key appearing as a global id on the chain.

**Why this is the ideal**

- **Minimizes trust** for dedupe and membership: observers verify proofs and nullifier sets,
  not “the platform says so.”
- **Strongest per-thread anonymity** compatible with “no double voting” — unlinkable across
  polls and threads except where the user chooses to reveal.
- Aligns with [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md) roadmap (multi-provider attestations,
  electoral integration) and REQUIREMENTS **R27**.

**Costs and prerequisites**

- Substantial crypto engineering, mobile performance work, and auditor tooling.
- Issuer trust (KYC / electoral authority) remains; ZK removes **platform** as dedupe bottleneck,
  not the need for verified membership.
- Schema and envelope design **today** should leave a clear slot for “membership proof” to
  replace or augment platform nullifier attestation without breaking the record model.

### 5.6 Comparison at a glance

| | Multi-passkey | HW signing | Cross-device edit | Public double-vote check | Thread anonymity | Trust minimized |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **1 Registry** | ✓ | ✓ | ✓ | partial (platform) | ✓ if links private | medium |
| **2 Synced persona** | weak | ✓ | only if keys synced | partial | ✓ | medium |
| **3 Nullifier + devices** | ✓ | ✓ | ✓ | partial (platform) | ✓ | medium |
| **4 ZK credentials** | ✓ | ✓ | ✓ (with design) | **strong** | **strongest** | **high** |
| **5 Published device graph** | ✓ | ✓ | auditable | — | **✗ cross-thread leak** | — |

### 5.7 What we explicitly reject

- **Exportable master key files** as the primary multi-device story.
- **Per-device thread personas without user-level dedupe** — breaks “user is the boundary” for votes.
- **One account-level public key on all threads** — destroys per-thread anonymity.
- **Platform-held private signing keys** or server-side signing on behalf of users.
- **On-chain or widely published device authorization graphs** that reuse the same device
  identifier across threads (Method 5).

---

## 6. Device and key custody (near-term implementation)

These are **hard preferences** from product review. Near-term work should align with
**§5.4 (Method 3)** while keeping wire formats compatible with **§5.5 (Method 4)**.

1. **Private keys stay on the device** — signing happens only on hardware or in a
   non-exportable software key slot, not on the server.
2. **Prefer non-exportable keys** over asking users to manage, export, or sync a “master
   secret” file.
3. **The platform must not have the keys** — public keys and attestations only.
4. **Separate passkeys on separate phones are acceptable** — syncing the same identity
   across devices is desirable but **not** a hard requirement.

### Why this matters

The current reference implementation derives thread keys from a 32-byte per-jurisdiction secret
(the jurisdiction master) and signs with library code that reads raw key bytes. That is fine for tests and prototypes.
**Production web clients should move toward keys the app cannot read as bytes** — e.g.
Web Crypto `CryptoKey` with `extractable: false`, backed by the secure enclave where the
OS provides it.

### Preferred production approach (Method 3–aligned)

**Non-exportable device keys + stable thread persona:**

1. **Authenticate** with a passkey (proves the session).
2. **Enroll device key** *Dᵢ* — non-exportable (Web Crypto / secure enclave); platform stores
   **public** key only, linked to user.
3. **Thread persona** *Pₜ* — stable public author id per (user, thread); registered when the
   user joins the thread.
4. **Sign each envelope** with *Dᵢ*; record carries `author = Pₜ` and (where needed) a
   per-(user, jurisdiction) nullifier for singleton actions.
5. **Reserve proof slot** in envelope or attestation structure for future ZK membership
   presentations (§5.5).

The app should not persist raw private scalars in IndexedDB or localStorage.

### How to seed the jurisdiction root (without a user-managed master file)

| Method | When to use |
|--------|-------------|
| **Passkey PRF** | When the browser and authenticator support it: derive unlock material from the passkey at login. Same passkey on two synced iPhones → same derived keys. |
| **Non-exportable generateKey** | When PRF is unavailable: create a jurisdiction root in Web Crypto once per device; store only a key handle, not bytes. |
| **Passkey largeBlob** | Optional future path: small secret stored on the authenticator for the same credential only. |

**Explicitly deprioritized:** asking users to download, print, or email a master key;
server-side escrow of encrypted private keys.

### Passkey sync vs. “add device”

- **Same passkey synced** (e.g. iCloud Keychain on two iPhones): may share the same *Dᵢ* or
  the same nullifier root derivation — same thread persona *Pₜ* per thread.
- **New passkey on a second phone (“add device”)**: enroll second *Dᵢ*; same user privately;
  same *Pₜ* and same nullifier root per §5.4. Cross-device edit uses any enrolled *Dᵢ*.
  **Do not** publish a device graph linking threads (§5.3, Method 5 ruled out).

We do **not** require independent device keys per thread; we **do** require that whichever
path we ship keeps private keys off the platform and signs on device.

### Account-login auth: passkeys + the three OTP purposes (server, `@oursay/api`)

Account login (proving *who is signed in*) is deliberately separate from civic signing (§2). Two key
families, two tables:

- **Account-login passkeys** → `auth.passkey_credentials`. The preferred, day-to-day factor. A user
  may enroll **several** (one per device); each is independent and the platform stores only public
  credential metadata.
- **Civic device keys** → `public.device_keys` (this section's *Dᵢ*). Sign public-record actions
  on-device; enrolled after login via `POST /v1/civic/devices` (public key only), listed/revoked via
  `GET /v1/civic/devices` / `POST /v1/civic/devices/revoke`. A second phone = a second passkey **and**
  a second civic device key under the same user.

**Email OTP is never a standing login method.** It exists for exactly three **purposes**, all sent
through one request endpoint (`POST /v1/auth/otp/request`, discriminated by `purpose`) so there is a
single send path with no duplicate routes:

| Purpose | Trigger / gate | Verify | Session | Revokes others? |
|---------|----------------|--------|---------|-----------------|
| `registration` | first-time bootstrap; 409 if email already registered | `POST /v1/auth/otp/verify` (+ profile) | **full** | n/a (new account) |
| `recovery` | lost passkey; sent only if the account exists (no enumeration) | `POST /v1/auth/recovery/verify` | **recovery** (enroll-only) | **yes** — security reset |
| `login` | **gated** cross-device sign-in; sent only while an enable window is open | `POST /v1/auth/login/verify` | **login** (enroll-only) | **no** — additive |

**Gated login (the new-device path).** Most of the time login OTP is *disabled*: a new/unenrolled
device cannot sign in with email alone. A **trusted device** (a valid **full** session **with** an
enrolled passkey) opens the window via `POST /v1/auth/login/enable`, which emails a `login` code. The
window is the active `login` OTP itself — short-lived (bounded by `OTP_TTL_SEC`, default 10 min) and
one per account (issuing a new one invalidates the prior). The new device redeems the code at
`POST /v1/auth/login/verify` → a **limited `login`-scoped** session that may **only** enroll a
passkey; the device then logs in with that passkey for full access. Without an open window, a bare
`login` request sends nothing and verify fails — no enumeration, no bypass of the passkey requirement.

This separates cleanly from **recovery**: gated login is *additive* (the holder still has access on a
trusted device, so other sessions are kept), while recovery assumes *lost access* and revokes every
prior session. Both end in a new passkey.

---

## 7. Multi-device summary

| Goal | Approach |
|------|----------|
| Same persona on phone and tablet | Same *Pₜ* per thread; enroll multiple *Dᵢ* or rely on passkey sync (§5.4). |
| Second passkey, no sync | Enroll second *Dᵢ*; shared per-(user, jurisdiction) nullifier root; same *Pₜ* when joining thread from either device. |
| Add device (account login) | From a trusted full session, enroll an additional **account-login passkey** (`auth.passkey_credentials`); independent per device, public metadata only. |
| Sign in on a brand-new device | **Gated login OTP** (§6): trusted device opens the window → new device redeems a `login` code → enroll-only session → enroll a passkey. Additive; does not revoke other sessions. |
| Cross-device edit | Any *Dᵢ* registered to same user may sign edit (§5.4 rule 6). |
| Lost device | Revoke *Dᵢ* enrollment (`POST /v1/civic/devices/revoke`); for account login use **recovery** (revokes prior sessions). Do not publish revoked keys as cross-thread correlators. |
| Platform holds signing keys | **Never.** |
| Trustless dedupe | **Method 4 (ZK)** — permanent goal (§5.5). |

---

## 8. Auditing, trust, and counts (context)

These points from the broader alignment review belong in the same picture:

- **Anyone** should be able to audit the record from published data and anchors; old copies
  help detect censorship if the platform withholds new data.
- **Double voting** must be detectable publicly (nullifiers + tallies).
- **Tamper resistance**: mutable store holds content; the chain holds commitments; anchors
  prove history. Editing content without a new signed transaction must fail verification.
- **Trust surface for tallies**: residency and age for *filtered counts* ultimately trust
  verified identity data — the platform should publish enough signed detail that individuals
  can check they were included or excluded fairly. Tier- and region-filtered signed counts
  are MVP requirements but not fully built yet.
- **External anchoring** (not only our servers) is required before we claim full
  trustlessness; see [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md).

---

## 9. Jurisdiction and validation gates (future-facing)

Many checks should eventually be **configurable per jurisdiction**, with platform defaults:

- Envelope freshness (how old a signature may be).
- Whether unverified users may comment, react, or vote.
- Whether votes or signatures are final by default.
- Whether comments are limited to one per thread per user (default: many comments allowed).

A **jurisdiction** (docs/01 §6.0) is 1:1 with a chain and now carries its `level` plus default
gating **rules** (`public-record/src/jurisdiction.ts`). Gating resolves as the jurisdiction's
defaults **⊕** an entity's own overrides (`governance.ts` `resolveRules`) — e.g. whether a vote may
change or a signature be revoked. Remaining gates (envelope freshness, unverified-user permissions,
one-comment-per-thread) are still global environment config; folding them into `JurisdictionConfig`
is the next step.

---

## 10. Implementation status (honest snapshot)

Use this when prioritizing work; see [`../public-record/TESTING-REPORT.md`](../public-record/TESTING-REPORT.md)
for test detail.

| Area | Status |
|------|--------|
| Per-thread P-256 signing + `appendSigned` gate | Implemented (tests) |
| Thread registration + private binding | Implemented |
| Nullifier dedupe for votes/reactions/signatures | Implemented |
| Author (thread persona) / signer (device key) envelope split | Implemented (tests) |
| Multi-device enrollment registry + thread-scoped signers (library) | Implemented (tests) |
| Cross-device editing (any enrolled device of the same user) | Implemented (tests) |
| Per-(user, jurisdiction) nullifier root (shared across a user's devices) | Implemented (framing + tests) |
| Account-auth passkey sessions (server, `@oursay/api`) | Implemented (tests) — WebAuthn register + passkey login over `@simplewebauthn/server`; opaque DB-backed sessions. This passkey is the **account-login** factor (§2) and is **separate** from the civic thread-signing keys above. |
| Unified email-OTP request — three purposes (server, `@oursay/api`) | Implemented (tests) — one `POST /v1/auth/otp/request` with `purpose` ∈ {registration, recovery, login}; OTP is bootstrap/recovery/gated-login only, never standing login. Hashed codes, rate limits, pluggable mailer (Postmark/SMTP/SES + dev noop). |
| Gated cross-device login OTP (server, `@oursay/api`) | Implemented (tests) — trusted device (full session + passkey) opens the window via `POST /v1/auth/login/enable`; new device redeems at `POST /v1/auth/login/verify` → limited `login` (enroll-only) session; no enable → no send/verify (no enumeration); additive (does not revoke other sessions). |
| Multi-passkey account login / "add device" (server, `@oursay/api`) | Implemented (tests) — multiple `auth.passkey_credentials` per user; re-run passkey register from a trusted session to add a device. |
| Civic device-key enrollment over HTTP (server, `@oursay/api`) | Implemented (tests) — authenticated `POST/GET /v1/civic/devices` + `POST /v1/civic/devices/revoke` into `public.device_keys`; public key only, owner-scoped revoke, separate from account-login passkeys. |
| KYC-gated recovery branch (`@oursay/api`) | Stub — recovery reads `public.kyc_attestations`; unverified → re-enroll passkey, verified → KYC re-verification required (provider stubbed, §3.3). |
| Dev account-walk harness (`@oursay/api`, `/walk`) | Implemented (dev-only) — same-origin HTML page driving the real `/v1` routes (register → passkey → **civic golden path via the real SDK** → logout → login → gated cross-device login → recovery re-enroll) so WebAuthn ceremonies can be QA'd by hand; not registered under `NODE_ENV=production`. |
| Production Web client adapter (browser passkey UX) | Implemented — `WebPasskeyConnector` + `IdentitySession` + `CivicHttpClient` drive the civic golden path (enroll → join → prepare → device-sign → submit) in a real browser; the walk page bundles the SDK at `/walk/identity.js` (dev-only esbuild) and runs it end-to-end. No more ephemeral civic-key stand-in. |
| Non-exportable Web Crypto signing path (production civic keys) | Implemented — the derivation root stays non-exportable: WebAuthn **PRF** keeps it inside the authenticator, and when PRF is unavailable a **secure-storage fallback** seals a random 32-byte master under a **non-extractable AES-GCM key in IndexedDB** (`secure-store.ts`) instead of throwing. Thread-scoped P-256 signers are HKDF-derived from the root (Method 3 precludes non-extractable *derived* keys) and are ephemeral in memory — never persisted, exported, or sent; the platform holds public keys only. Remaining: cross-device encrypted export of the fallback master (design-only). |
| Claim / unclaim public ownership (R8, R9) | Schema stub only |
| Selective reveal to institutions (R11) | Not built |
| Jurisdiction-specific validation policy | Partial — jurisdiction router + default gating rules (change/revoke) with per-entity override (`jurisdiction.ts` / `governance.ts`); freshness + permission gates pending |
| External anchoring (Git / EVM / …) | Not built |
| Tier- and region-filtered signed counts (R24–R26) | Not built |
| ZK membership credentials (Method 4 — ideal goal) | **Not started; wire slot reserved (envelope `proof` + `nullifier_attestations.membership_proof`), rejected until built (§5.5)** |

**Method-3 implementation note (library).** The published `signer` is a **thread-scoped**
device key (a distinct key per `(device, thread)`), so the same physical device shows no
cross-thread correlator on the record — Method 5 (§5.3) stays ruled out. The device→user
link lives only in the private `device_keys` / `thread_signers` registry, never on the
envelope. `appendSigned` authorizes a device-signed envelope when the signer maps to the
same verified user (and thread) as the thread persona; any enrolled, non-revoked device may
then edit that user's content in the thread. When no `signerPubkey` is present the persona
signs directly (single-device / passkey-sync path). The reserved ZK slot is **reserve-and-
reject**: an envelope that actually carries `proof` is rejected until Method 4 verification
exists. **Still for Method 4:** real credential issuance + ZK proof generation/verification to
replace platform nullifier attestation as the dedupe trust root.

---

## 11. Production data retention

The civic record is **append-only by design**. Wiping live Postgres rows, Docker volumes, or chain
state in production is **prohibited** — recovery is always **restore from backup** and/or **stand up
a fresh node, replay anchors, and reconcile**; never `TRUNCATE` or `docker compose down -v` against
production data.

**In-repo guards (today).** `scripts/destructive-guard.ts` blocks when `NODE_ENV=production`:

| Surface | Operation |
|---------|-----------|
| `public-record` / `immudb-test` `npm run db:down` | `docker compose down -v` |
| `@oursay/identity` `npm run reset` | dev custody wipe + `db:down -v` |
| `PrivateStore.reset()` | `TRUNCATE` all private tables |
| `DevPasskeyConnector` | construct / `destroyAll()` (dev only) |

There is **no** production override env var. To run destructive dev tooling, the process must not be
in production mode.

**Before production (ops checklist — not enforced in code).**

- [ ] Managed Postgres (or equivalent) with **no** `TRUNCATE`/`DROP` on the application DB role.
- [ ] Application hosts **without** Docker socket access; compose stacks are dev/CI only.
- [ ] Automated backups + tested restore; external anchors (Git / chain) as the public witness.
- [ ] Runbook for mass corruption: freeze writes → restore snapshot → verify anchors → reconcile delta.
- [ ] `NODE_ENV=production` on all production Node processes (API, workers).
- [ ] Secrets/IAM: only break-glass roles can drop databases; actions audited.

Raw `docker` / `psql` / cloud-console deletes are **not** gated by npm — defense is infrastructure
and access control.

---

## 12. Decision checklist for pull requests

Before merging changes that touch identity or user data, confirm:

- [ ] Private signing material never stored on the server or logged.
- [ ] Production path does not depend on long-lived exportable raw private keys in the client.
- [ ] New envelopes remain individually signed; no “unsigned verified tier” in production.
- [ ] Cross-thread linkage is not introduced in public envelopes, nullifiers, or anchors.
- [ ] Singleton actions still dedupe per **user**, not only per thread public key.
- [ ] Multi-device behaviour is documented if it changes (sync vs. second device enrollment).
- [ ] User-initiated linkability (claim / reveal) is not foreclosed by schema or API choices.
- [ ] No stable **device** identifier is published in a form that could link the same user across threads (§5.3, Method 5).
- [ ] Envelope or attestation layout remains compatible with a future ZK proof slot (§5.5).
- [ ] New destructive tooling calls `assertDestructiveAllowed` or is documented as dev-only (§11).

---

## 13. Related documents

| Document | Role |
|----------|------|
| [`01-CONTRIBUTOR-SPEC.md`](./01-CONTRIBUTOR-SPEC.md) | Product model, tiers, content types |
| [`06-PRIVACY-REVIEW.md`](./06-PRIVACY-REVIEW.md) | Who may see what; inference risks |
| [`05-TRUST-REVIEW.md`](./05-TRUST-REVIEW.md) | What is trustless vs. trusted today |
| [`VALUES.md`](./VALUES.md) | Engineering values and anti-patterns |
| [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) | Normative R1–R28 |
| [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md) | Worked technical design |
| [`../passkey-test/FINDINGS.md`](../passkey-test/FINDINGS.md) | WebAuthn + PRF spike results |

---

_Last updated: June 2026 — identity alignment review, device-signing policy, and greenfield
architecture review (Methods 1–5; build toward Method 3, ideal Method 4)._
