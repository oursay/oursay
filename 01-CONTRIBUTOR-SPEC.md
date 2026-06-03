# OurSay.ca — Contributor Reference: Product Specification

> **Purpose of this document:** This is the canonical reference for all contributors to OurSay.ca.
> When a design question arises — about features, user flows, data relationships, or system
> behaviour — consult this document first. It describes *what* the system does and *why*, not
> *how* to implement it. Schema design, API structure, and frontend layout are decisions left
> to contributor judgment, informed by this specification.
>
> If a significant design decision is not answered here, discuss it in a GitHub issue or RFC,
> then update this document before closing the issue.

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Guiding Principles](#2-guiding-principles)
3. [Infrastructure & Hosting](#3-infrastructure--hosting)
4. [User Roles & Identity States](#4-user-roles--identity-states)
5. [Identity Verification (KYC)](#5-identity-verification-kyc)
6. [Geographic Data: Ridings](#6-geographic-data-ridings)
7. [Content Model](#7-content-model)
8. [User Actions](#8-user-actions)
9. [Discussions](#9-discussions)
10. [The Distributed Public Ledger (Internal: Solana)](#10-the-distributed-public-ledger-internal-solana)
11. [Transparency & Source Code Auditability](#11-transparency--source-code-auditability)
12. [Notifications & Communication](#12-notifications--communication)
13. [Contributor Decision-Making](#13-contributor-decision-making)
14. [Future Roadmap Considerations](#14-future-roadmap-considerations)

---

## 1. Project Vision

OurSay.ca is a civic platform that gives Albertans — and eventually all Canadians — a structured, verifiable, and auditable way to express political beliefs, sign petitions, and participate in informal referendums. It is not a social network. It is not a polling service. It is civic infrastructure designed to make the authentic will of electors legible, persistent, and publicly auditable at the riding, provincial, and national level.

The platform is built on the premise that representative democracy, while foundational, was designed for a world without instant communication. Citizens currently have no verified, persistent mechanism to express their views between elections. OurSay fills that gap.

The platform is completely open source. The code, the data structures, and the audit mechanisms are public. Any citizen, journalist, researcher, or developer should be able to verify that the platform operates as documented, and that results are legitimate.

**Launch scope:** Alberta. All architecture decisions must anticipate national expansion without requiring a rebuild.

---

## 2. Guiding Principles

These principles should inform every design decision made by contributors.

1. **Verifiability over volume.** A single verified elector's action carries more civic weight than a thousand unverified ones. The platform makes this distinction explicit everywhere — in counts, in displays, and in exports.

2. **Auditability above all.** Every significant action in the platform must be auditable — by the user who took it, and by the general public. No result should ever require trusting OurSay's word.

3. **Anonymity is a right, not a loophole.** Users may choose to keep their votes, signatures, and agreements anonymous. This is a feature. Anonymity must be preserved at the individual level without compromising aggregate auditability.

4. **Cost transparency.** Verification has a real cost. The platform does not hide this. The cost model is explained openly to users before they proceed.

5. **No political agenda.** The platform is a neutral civic tool. It does not promote, weight, or amplify any political position. All beliefs, petitions, and referendums are treated equally by the platform's mechanics.

6. **Minimal trust required.** Users should not need to trust OurSay. They should be able to independently verify that the platform is running the published open source code and that results match the public record.

---

## 3. Infrastructure & Hosting

The following decisions are locked in and should be treated as constraints, not suggestions. All other technology choices are left to contributor judgment.

### 3.1 Hosting

Google Cloud Platform or Amazon Web Services. The platform may use one or both. Contributors should favour managed, auditable, reputable services with strong security posture and no known government backdoors. Infrastructure-as-code should be committed to the repository so the hosting configuration is itself publicly auditable.

### 3.2 Source Control & Open Source

All code is published publicly on GitHub. The repository is the canonical source of truth for the application. Every merged pull request is part of the public record. Secrets, credentials, and private keys must never be committed under any circumstances.

### 3.3 KYC Provider

Equifax Connect is the preferred identity verification provider. The provider is responsible for:

- Identity confirmation (name, date of birth)
- Address verification, used to infer riding assignment
- Age verification for elector eligibility (18+)
- Citizenship inference from public records
- Public official status verification via public record lookup

The KYC integration should be architected with provider abstraction in mind. A future migration to Elections Alberta's direct verification system, or any other provider, should not require a full rebuild of verification-dependent features.

### 3.4 Distributed Public Ledger

Internally, OurSay uses the **Solana blockchain** to store verified user signoffs and auditable action records.

> **⚠️ Critical:** The use of Solana is an internal implementation detail that must never appear in any public-facing interface, user documentation, or external communication. All public-facing references use language such as "distributed public database," "public audit ledger," or "cryptographically verifiable public record." This document and all internal developer documentation may use the term blockchain freely. The rationale is covered in [Section 10](#10-the-distributed-public-ledger-internal-solana).

### 3.5 Build Verification

Every production deployment must produce a publicly verifiable hash. That hash must be published in the repository (e.g., in a `DEPLOYMENTS.md` file) and anchored on-chain. This allows any person to download the published source, build it, and confirm it matches the deployed application.

---

## 4. User Roles & Identity States

Users exist on a spectrum from fully anonymous visitors to fully verified elected officials. The system must accommodate all of these and distinguish them clearly in all data, APIs, and interfaces.

### 4.1 Guest (Unauthenticated Visitor)

A guest has no account. They can:

- Browse beliefs, petitions, referendums, results, and discussions
- View all aggregate counts, filtered by riding, province, and verification status

They cannot take any action (agree, sign, vote, comment). No personal data is collected from guests.

### 4.2 Unverified User

A user who has created an account but has not completed KYC. They can:

- Express beliefs (agree/disagree)
- Sign petitions
- Vote on referendums
- Participate in discussions
- Apply for KYC verification
- Join the verification waitlist
- Sponsor other users' verifications

Their actions are counted and displayed separately from verified actions. Unverified counts do not carry electoral weight but are still meaningful and publicly visible.

### 4.3 Verified Elector

A user who has successfully completed KYC. In addition to all unverified capabilities:

- Their actions are recorded on the distributed public ledger
- Their riding is confirmed and their actions are attributable to that riding in all filtered views
- Their verified status is displayed alongside their actions (unless they choose anonymity)
- They are confirmed as an eligible elector in their province

Verification does not override anonymity choices. A verified user may still choose to act anonymously. In that case, their action is counted in the verified totals without their display name being attached.

### 4.4 Public Official / Politician User

MLAs, MPs, municipal councillors, and other elected or appointed officials have a distinct user type. Their verification is based on public record rather than standard KYC. Their official role, riding or constituency, and party affiliation (if applicable) are displayed on their profile.

Public officials can perform all standard user actions. Their actions are displayed with their official role prominently. They may also post official statements or responses linked to beliefs, petitions, or referendums relevant to their constituency.

Public officials have no moderation or administrative capabilities by default.

### 4.5 Administrator

Platform administrators have access to moderation tools, user management, and system configuration. All administrative actions are logged and, where appropriate, publicly auditable. Administrators cannot alter vote counts, verification statuses, or on-chain records.

---

## 5. Identity Verification (KYC)

### 5.1 Verification Flow

1. User initiates KYC from their account profile or settings
2. User reviews the verification cost and consents to payment
3. User is directed through the Equifax Connect verification flow
4. On completion, the provider returns a result and associated data
5. On a **pass**: the system marks the user as a verified elector, records their riding assignment, and creates an on-chain record linking their pseudonymous ledger identity to their confirmed elector status — without storing personally identifiable information on-chain
6. On a **failure**: the user is notified with guidance. No on-chain record is created.

### 5.2 Verification States

Every user account carries exactly one verification state at any time.

| State | Description |
|---|---|
| `unverified` | No KYC attempted or in progress |
| `pending` | KYC process initiated and in progress |
| `verified` | KYC passed; confirmed elector |
| `failed` | KYC completed but did not pass |
| `sponsored_pending` | User has received a sponsorship and has not yet initiated KYC |
| `refused` | User received a sponsorship but did not complete KYC within 30 days |
| `official_verified` | Verified as a public official via public record |

The `refused` state is permanent and visible on the user's public profile. It does not permanently prevent future verification — the user may pay themselves or receive a new sponsorship — but the refusal record is never removed.

### 5.3 Cost Model & User Payment

KYC verification has a real per-verification cost determined by the provider and volume tier. The platform does not subsidize this cost and does not mark it up. Users pay the direct cost of verifying their identity. The exact cost must be displayed to the user before they confirm payment. The platform's payment infrastructure processes verification payments and passes them through to the provider.

### 5.4 Sponsorship System

Any registered user — verified or unverified — may pay for another user's KYC verification. Sponsorships may target a specific named user or a user on the verification waitlist.

**Rules:**

- Sponsorships are **public by default**. The sponsor's display name, the recipient's display name, and the outcome are recorded in a publicly viewable sponsorship ledger.
- A sponsor may choose to sponsor **anonymously**. Their identity is withheld, but the sponsorship, recipient, and outcome are still publicly recorded as an anonymous sponsorship.
- If the sponsored user **passes** verification: recorded publicly.
- If the sponsored user **fails** verification: recorded publicly.
- If the sponsored user does **not initiate or complete KYC within 30 days** of receiving the sponsorship: their state becomes `refused`. This is recorded publicly.
- The platform must send a reminder notification to the sponsored user before the 30-day deadline.
- Sponsorship payments are non-refundable once a KYC session has been initiated.

### 5.5 Verification Waitlist

Users who want to verify but cannot afford the cost may join the public verification waitlist. Other users can browse the waitlist and choose to sponsor an entry.

Each waitlist entry displays:

- The user's display name (or "Anonymous" if they prefer)
- Time on waitlist
- Whether a pending sponsorship has been received and is awaiting action

Users may remove themselves from the waitlist at any time.

### 5.6 Riding & Eligibility Inference

The KYC provider infers the user's provincial and federal electoral riding from their verified address. Both riding assignments are stored against the user's account and drive all geographic filtering throughout the platform.

At launch, Alberta provincial ridings are the primary scope. Federal riding data is also captured wherever inferable, in anticipation of national expansion.

Riding assignments must be updatable when a user moves and re-verifies. The system must preserve the historical riding at the time of each action for audit integrity — a user's current riding changing should not alter past records.

---

## 6. Geographic Data: Ridings

### 6.1 Alberta Provincial Ridings

At launch the platform covers all Alberta provincial electoral divisions. Riding boundary and naming data must come from Elections Alberta's authoritative published data. Each riding entry holds:

- Official name
- Assigned MLA (linked to a public official user profile if one exists)
- Province association

### 6.2 National Data Model

The data model must support federal ridings, all provinces, and territories from the start. These records may be inactive at launch but must not be an afterthought that requires restructuring on expansion.

### 6.3 Filtering

All aggregate counts — belief agreements/disagreements, petition signatures, referendum votes — must be filterable by:

- Provincial riding
- Federal riding
- Province / territory
- Verification status (verified only, unverified only, all)
- Date range

Filters must be combinable. All public aggregate views, including guest-accessible views, must support these filters.

---

## 7. Content Model

Content on OurSay exists in a four-level hierarchy. Linkage between levels is optional. The hierarchy represents escalating formality and consequence.

```
Beliefs  →  Petitions  →  Referendums  →  Results
```

A belief is an informal expression of sentiment. A result is a formal, audited outcome of a vote. Links between levels allow a published result to be traced back to the grassroots beliefs that shaped it.

### 7.1 Beliefs

A belief is a statement submitted for others to agree or disagree with. It is the most informal content type and the starting point for civic conversation.

**Core attributes:**

- Statement / title (the belief itself)
- Author (may be anonymous)
- Creation timestamp
- Category and tags
- Links to petitions (optional, many)
- Agree count: total | verified | unverified
- Disagree count: total | verified | unverified
- Discussion thread

**Behaviour:**

- Any registered user may create a belief
- Any registered user may agree or disagree
- A user may change their position at any time
- Users may act anonymously
- Beliefs do not expire unless archived by an administrator

### 7.2 Petitions

A petition is a formal call to action that collects signatures. It represents a directed request to a specific authority — an MLA, a government body, an institution — and carries more weight than a belief alone.

**Core attributes:**

- Title
- Full petition text
- Author (may be anonymous)
- Addressed to (e.g., a specific MLA, a government body — may link to a public official profile)
- Links to beliefs (optional, many)
- Links to referendums (optional, many)
- Signature count: total | verified | unverified
- Optional deadline
- Status: open | closed | delivered | responded
- Discussion thread

**Behaviour:**

- Any registered user may create a petition
- Any registered user may sign
- Signatories may include an optional comment with their signature (not shown if signing anonymously)
- A user may withdraw their signature
- Petitions may be closed by their creator or by an administrator
- When a petition is marked as delivered to a public official who has a platform account, the system notifies that official and creates a prompt for an official response

### 7.3 Referendums

A referendum is a formal vote — binary or multiple-choice — put to users. It carries the greatest formal weight on the platform, and its results are the primary data that anchors to the public ledger.

**Core attributes:**

- Question / title
- Full description providing context for the question
- Vote options (minimum: Yes / No; additional options permitted)
- Author (may be an administrator or a verified user meeting a contribution threshold, TBD by contributors)
- Links to petitions (optional, many)
- Voting period (open and close timestamps)
- Vote counts per option: total | verified | unverified
- Status: upcoming | active | closed | result published
- Discussion thread

**Behaviour:**

- Referendum creation may be triggered automatically when a linked petition reaches a configurable verified signature threshold
- Any registered user may vote
- Users may vote anonymously
- A vote, once cast, is final and cannot be changed — this is what distinguishes referendums from beliefs
- After the voting period closes, a result is generated

### 7.4 Results

A result is the immutable, formal record of a closed referendum's outcome.

**Core attributes:**

- Linked referendum (exactly one)
- Final vote counts per option: total | verified | unverified
- Riding-level breakdown
- Province-level breakdown
- Verification status breakdown
- Publication timestamp
- On-chain audit reference (transaction / record identifier)
- Discussion thread

**Behaviour:**

- Results are immutable once published. No editing, no deletion.
- Results are publicly visible to all users, including guests
- Results surface links back to their referendum, and through it to any linked petitions and beliefs
- Every result is anchored on-chain for independent auditability

### 7.5 Content Hierarchy & Linking

Linking between content levels is always optional and many-to-many where applicable:

- A belief may be linked to zero or many petitions
- A petition may be linked to zero or many beliefs, and to zero or many referendums
- A referendum may be linked to zero or many petitions
- A result is linked to exactly one referendum

Links are directional at creation — a petition links *to* a belief; the belief is not required to reference the petition. However, the system must surface these relationships bidirectionally for navigation and context.

---

## 8. User Actions

### 8.1 Agreeing / Disagreeing on Beliefs

A user selects agree or disagree. The action record includes:

- The user's identity reference (pseudonymous on-chain key for verified users; off-chain account reference for unverified)
- Timestamp
- The user's riding at the time of the action
- Anonymity flag

Counts are displayed as total | verified | unverified and are filterable by all geographic and status dimensions.

### 8.2 Signing Petitions

Functionally similar to a belief agreement, but semantically represents a formal request co-signed by the user. The same recording and anonymity rules apply. An optional signer comment may be attached, displayed only if the signing is not anonymous.

### 8.3 Voting on Referendums

The most consequential action on the platform.

- Votes are final — no changes after casting
- Verified user votes are recorded on-chain
- The on-chain record links the vote to the user's pseudonymous ledger identity and to the referendum record
- Anonymous verified votes are still on-chain — the user's pseudonymous key is used, but the public display shows only "verified anonymous"

### 8.4 Anonymity Model

Any action — agree, disagree, sign, vote, comment — may be taken anonymously. Anonymity means:

- The user's display name is not shown in public views
- The action is attributed to "Anonymous" or a non-identifying token

Anonymity does not mean the action is untraceable by the user themselves:

- The user retains a hash or receipt of their action
- For verified users, the on-chain record still exists under their pseudonymous key
- The user can verify their own action against the public ledger at any time

**Verified anonymous actions are still counted in the verified totals.** The identity is not displayed; the verification status of the action is. These are distinct properties and must be treated as such throughout the system.

---

## 9. Discussions

Every content item — belief, petition, referendum, result — has an associated discussion thread.

**Core attributes:**

- Comment text
- Author (may be anonymous)
- Timestamp
- Parent comment reference (for threaded replies)
- On-chain hash reference for auditability
- Engagement signal (upvote / flag — implementation left to contributors)

**Behaviour:**

- Any registered user may comment
- Comments may be made anonymously
- Comments may be reported for moderation review
- Administrators may remove comments that violate platform guidelines
- All comments, including removed ones, have an on-chain hash so users can prove a comment existed at a specific time — this is important for dispute resolution and moderation accountability

---

## 10. The Distributed Public Ledger (Internal: Solana)

> **⚠️ Internal documentation only.** The use of Solana blockchain is an internal implementation detail. All public-facing language must use terms such as "distributed public database," "public audit ledger," or "cryptographically verifiable public record." No public interface, user-facing documentation, or external communication should mention Solana, blockchain, cryptocurrency, wallets, keypairs, or on-chain. This document and all internal developer materials may use these terms freely.

### 10.1 What Goes On-Chain

The following are recorded on the Solana blockchain:

- Verified elector signoffs (pseudonymous identity linked to confirmed elector status — no PII stored on-chain)
- Referendum votes by verified users
- Petition signatures by verified users
- Belief agreements and disagreements by verified users
- Comment hashes (for all registered users, verified or not)
- Published result records (final counts of closed referendums)
- Build hashes (production deployment records for source code auditability)

Unverified user actions are stored in the platform's off-chain database only. They do not appear on the public ledger.

### 10.2 Pseudonymous Identity

Each verified user has a Solana keypair associated with their platform account. Their public key is their on-chain identity. Their private key signs their on-chain actions.

The mapping between a user's platform account and their Solana public key is:

- Known to the platform (required for operation)
- Not published publicly
- Accessible to the user themselves, so they can audit their own on-chain history

A user's Solana public key reveals nothing about their real-world identity. What the public ledger proves is that each recorded action was taken by a distinct verified elector — not who that elector is.

### 10.3 Public Auditability

Any person, without an account or any special access, must be able to:

- Query the public ledger and see the total count of verified votes on any referendum
- Verify that each on-chain vote was cast by a distinct verified elector (preventing double-voting)
- Confirm that a published result matches the on-chain record
- Verify the platform backend's count independently

All on-chain data structures must be documented in the repository so that independent auditors can write their own queries without relying on OurSay's tooling.

### 10.4 User Self-Audit

Every user must be able to:

- View a list of all their on-chain actions from within their account
- See the transaction ID or hash for each action
- Verify each action against the public ledger independently via a link or export
- Export their complete action history

This is non-negotiable. A user who votes anonymously on a referendum must be able to prove, to themselves and to anyone they choose, that their vote was cast and counted correctly.

### 10.5 Required Public Language Reference

When describing audit and transparency features in any user-facing context, use:

- ✅ "Your vote is recorded in a distributed public database that anyone can audit"
- ✅ "Results are verified against a public, tamper-proof ledger"
- ✅ "Every verified signature is permanently recorded in a public record that cannot be altered"
- ❌ Blockchain, Solana, cryptocurrency, wallet, keypair, on-chain, smart contract

---

## 11. Transparency & Source Code Auditability

### 11.1 Open Source

The entire codebase — backend, frontend, infrastructure-as-code, data migration scripts, and audit tooling — is published on GitHub. Contributors should assume all committed code is readable by anyone, including adversaries. No secrets, credentials, or private keys are ever committed.

### 11.2 Build Verification

Every production deployment must produce a verifiable artifact:

1. A hash of the deployed build is computed at deployment time
2. The hash is published in the repository (e.g., `DEPLOYMENTS.md`)
3. The hash is anchored on-chain
4. Any user can download the published source, build it, and compare the hash

This mechanism is how OurSay earns the claim that anyone can verify the running application matches the published code.

### 11.3 Independent Audit Tooling

The repository must include tooling that allows any person to:

- Connect to the Solana network
- Query all OurSay-related on-chain records
- Reproduce any result published on the platform
- Identify any discrepancy between on-chain data and platform-displayed data

This tooling must have no dependency on OurSay's servers to function.

---

## 12. Notifications & Communication

The platform must notify users of events that affect them. At minimum:

- Sponsorship received — user is notified when someone sponsors their verification
- Sponsorship 30-day deadline reminder — sent with enough notice before the `refused` state is applied
- KYC verification result (pass or fail)
- Petition delivered to its addressee
- Official response posted to a petition or referendum relevant to the user
- Activity on content the user created (comment milestones, signature milestones)

Notification preferences are user-configurable. Email is the baseline notification channel. Push notifications may be added by contributors.

---

## 13. Contributor Decision-Making

When a design question arises that is not covered by this document:

1. **Does it affect auditability?** If yes, prefer the more auditable option.
2. **Does it affect user trust or transparency?** If yes, prefer the more transparent option.
3. **Does it expose the Solana implementation publicly?** If yes, revise the approach.
4. **Is it consistent with the guiding principles in Section 2?** Use them as a tiebreaker.

Significant decisions — those that affect how the platform fundamentally behaves — should be proposed in a GitHub issue or RFC before implementation. Accepted decisions update this document. The document version should be tracked and visible in the repository.

---

## 14. Future Roadmap Considerations

The following are anticipated future developments. They are out of scope for the initial launch but the architecture must not foreclose them.

- **Elections Alberta direct integration:** A formal KYC partnership with Elections Alberta for authoritative elector validation. The KYC abstraction layer in Section 5 exists to anticipate this.
- **National expansion:** All Canadian provinces and territories, federal ridings, and federal-level referendums.
- **Municipal layer:** Ward and municipal district filtering, municipal official profiles, council-level petitions.
- **Threshold-triggered referendums:** Automatic referendum creation when a linked petition reaches a configurable verified signature threshold.
- **Petition delivery workflows:** Tracked, auditable workflows for delivering petitions to named public official recipients.
- **Multilingual support:** French language support as a first-priority addition ahead of national expansion.
- **Mobile applications:** Native iOS and Android applications.
- **Offline verification flows:** Allowing communities with limited connectivity to participate.
