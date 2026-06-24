# OurSay — Contributor Reference: Product Specification

> **Purpose of this document:** This is the canonical reference for all contributors to OurSay.
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
4. [Verification Tiers & User Roles](#4-verification-tiers--user-roles)
5. [KYC Provider Architecture](#5-kyc-provider-architecture)
6. [Geographic Areas](#6-geographic-areas)
7. [Public API](#7-public-api)
8. [Content Model](#8-content-model)
9. [User Actions](#9-user-actions)
10. [Discussions](#10-discussions)
11. [The Public Record (Internal: immudb + external anchoring)](#11-the-public-record-internal-immudb--external-anchoring)
12. [Transparency & Source Code Auditability](#12-transparency--source-code-auditability)
13. [Forkability & Global Adaptability](#13-forkability--global-adaptability)
14. [Notifications & Communication](#14-notifications--communication)
15. [Contributor Decision-Making](#15-contributor-decision-making)
16. [Future Roadmap Considerations](#16-future-roadmap-considerations)

---

## 1. Project Vision

OurSay is an open source civic platform that gives communities a structured, verifiable, and auditable way to express political beliefs, sign petitions, and participate in public votes. It is designed to work for any democratic system, in any country, at any geographic level — from a local ward to a national constituency.

The platform makes the authentic will of verified participants legible, persistent, and publicly auditable. It is not a social network. It is not a polling service. It is civic infrastructure that can be adapted to any jurisdiction.

OurSay launches in Alberta, Canada as its first deployment. Every design decision must anticipate use in any jurisdiction, with any geographic structure, under any democratic system.

The platform is completely open source. Any deployment of OurSay must publish its source code publicly and maintain its audit mechanisms. This is enforced by the license.

**OurSay is not affiliated with, endorsed by, or approved by any government body or electoral authority.** This must be reflected in every public-facing deployment.

---

## 2. Guiding Principles

These principles inform every design decision made by contributors.

1. **Verifiability over volume.** A higher-tier verified participant's action carries more community weight than an unverified one. The platform makes verification tier visible everywhere.
2. **Auditability above all.** Every significant action must be independently auditable. No result should ever require trusting OurSay's word.
3. **Anonymity is a right, not a loophole.** Users may act anonymously at any tier. Anonymity must be preserved at the individual level without compromising aggregate auditability.
4. **Cost transparency.** Verification has a real cost. The platform does not hide this.
5. **No political agenda.** The platform is a neutral civic tool. All content is treated equally by the platform's mechanics.
6. **Minimal trust required.** Users should be able to verify independently that the platform runs the published code and that results are accurate.
7. **Generic by design.** No geographic term, verification label, or content category is hardcoded for a specific jurisdiction. The platform must adapt to any democratic system through configuration, not code changes.
8. **Open by requirement.** Any deployment must be open source and publicly auditable. This is a license condition, not a suggestion.

---

## 3. Infrastructure & Hosting

The following decisions are locked in and should be treated as constraints. All other technology choices are left to contributors.

### 3.1 Hosting

Google Cloud Platform or Amazon Web Services. Contributors should favour managed, auditable services with a strong security posture and no known government backdoors. Infrastructure-as-code must be committed to the repository so the hosting configuration is publicly auditable.

### 3.2 Source Control

All code is published publicly on GitHub. The repository is the canonical source of truth. No secrets, credentials, or private keys are ever committed under any circumstances.

### 3.3 KYC Providers

KYC providers are **pluggable and configurable per region or jurisdiction**. No single provider is locked in at the platform level. The integration layer must support:

- Multiple concurrent providers (different providers active in different regions simultaneously)
- Provider selection based on the user's geographic context (country, province, region)
- Different providers returning different verification outputs, mapped to different verification tiers (see Section 4)
- Provider configuration changes without rebuilding the platform

The **preferred provider for the Alberta launch** is Equifax Connect, or an equivalent service capable of confirming identity, age, and address from public records.

An integration with an official electoral authority (e.g., Elections Alberta) is the designed future path — it would constitute a separate, higher-trust provider yielding a distinct verification tier not available through commercial providers. The pluggable architecture exists precisely to make this possible without restructuring the platform.

### 3.4 Distributed Public Ledger

Internally, OurSay's public record is an **append-only, tamper-evident verifiable ledger (immudb)** that holds **only salted hash commitments and public metadata** — never raw content or PII. Raw content, salts, and PII live in a **separate, mutable store (Postgres)** so that redaction and erasure remain possible (an append-only ledger can never delete).

The write path has three decoupled phases:

1. **Pool.** Each civic action is accepted into a local pending queue in Postgres (`record_outbox`, tagged with its `chainId`). Nothing touches the ledger yet — pooling is a pure Postgres write.
2. **Settle.** A `BlockSettler` cuts a **block** from the pool when its trigger fires — a record-count threshold **or** an age fallback (oldest pending tx), whichever comes first — batch-committing the block's commitments to the ledger (`record_chain`) and writing a **block header** (`record_blocks`). The canonical block tip lives on the ledger, keyed by `(chainId, height)` — never in Postgres or in anchor files. Commitments reach immudb **at settlement**, not on the user's action.
3. **Publish / anchor.** Settled blocks are replicated to **external public infrastructure that the platform does not control**, on each target's own cadence, so anyone can verify the record's integrity without trusting OurSay. **Settlement and external anchoring are distinct steps** — a block exists on the ledger before, and independently of, any external anchor.

Each public record is its **own chain** (`chainId` = one legal/custodial record, e.g. the Alberta deployment — not a single global OurSay chain); one shared ledger can host several. Naming + lifecycle are documented in [`../public-record/README.md`](../public-record/README.md).

The **anchor target is pluggable**, and more than one may be used at once. The **preferred primary anchor is Ethereum** (the most decentralized option), with a public **transparency log** (e.g. a GitHub-hosted append-only file) as a low-cost complement, and an EVM L2 or other chain available as alternatives. _(Solana was originally considered as the anchor venue; it is now one valid optional target rather than "the ledger.")_ The architecture does not depend on any specific chain — the chain is only where the root is pinned.

The worked design lives in [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) (normative requirements) and [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md) (modules, schemas, connectors).

> **⚠️ Internal documentation only.** Never refer to Ethereum, Solana, blockchain, cryptocurrency, wallets, keypairs, or on-chain in any public-facing interface, documentation, or communication. (Plain technical terms such as cryptographic hash, content commitment, Merkle root, digital signature, anchoring, and append-only record are acceptable in public when needed; product names like immudb are allowed but not required on user-facing surfaces.) All public-facing references prefer "distributed public database," "public audit ledger," or "cryptographically verifiable public record." This document and all internal developer materials may use these terms freely.

### 3.5 Build Verification

Every production deployment must produce a publicly verifiable hash, published in the repository (e.g., `DEPLOYMENTS.md`) and anchored to the same external public infrastructure as the public record's root (see §3.4). Any person can build the published source and confirm it matches the deployed application.

---

## 4. Verification Tiers & User Roles

Participants exist on a spectrum from anonymous guests to officially validated public figures. Each tier has a distinct visual indicator in all interfaces. The exact icon design and visual treatment is left to frontend contributors — what matters is that each tier is visually distinguishable from all others at a glance.

### 4.1 Guest

No account. Can browse all public content, aggregate counts, and public vote results. Cannot take any action. No personal data collected.

### 4.2 Unverified User

Account created, no KYC completed. Can express beliefs (agree/disagree), sign petitions, vote on public votes, participate in discussions, apply for verification, join the verification waitlist, and sponsor other users. Actions are publicly counted and displayed separately from all verified tiers.

### 4.3 Identity Verified

KYC provider has confirmed the user's name and age (18+). Confirmed as a real person meeting minimum age requirements. No geographic district assigned at this tier. Distinct visual indicator from unverified and higher tiers.

### 4.4 Residency Verified

KYC provider has confirmed identity and address. The user is assigned to one or more geographic areas based on their verified address. This is the primary tier for community participation with geographic attribution.

> **Important:** Residency verification confirms that a user is a real person living at a verified address within a geographic area. It does not constitute a determination of electoral eligibility, voter registration status, or citizenship. The platform makes no such claim in any public-facing context.

Distinct visual indicator from identity-verified and other tiers.

### 4.5 Official / Public Figure Verified

Elected officials, public appointees, and other public figures verified through public record lookup. Their official role, jurisdiction, and affiliation (if applicable) are displayed on their profile. A prominent disclaimer must appear on any auto-generated official profile:

> *This profile is generated from public record. [Name] has not endorsed this platform and may not be aware of this profile.*

Officials can claim their profile, at which point the disclaimer is replaced with a "profile claimed" indicator. Officials have no moderation or administrative capabilities by default.

### 4.6 Electorally Validated *(Future Tier)*

Available only where a direct integration with an official electoral authority exists. This tier represents verification by the authoritative electoral body for a jurisdiction — the highest trust level the platform supports.

Distinct visual indicator, clearly differentiated from all other tiers. This is the designed future outcome of, for example, an Elections Alberta KYC integration. The pluggable provider architecture in Section 5 makes this achievable without platform restructuring. When this tier becomes available, it does not replace other tiers — it is an additional, optional upgrade path for users who want the highest verification level.

### 4.7 Administrator

Access to moderation tools, user management, and system configuration. All administrative actions are logged and auditable. Administrators cannot alter vote counts, verification statuses, or distributed ledger records.

---

## 5. KYC Provider Architecture

### 5.1 Provider Abstraction Layer

All KYC provider integrations are implemented behind a common interface. Platform business logic never calls a provider directly — it calls the abstraction layer, which routes to the configured provider for the user's jurisdiction.

This enables:
- Different regions using different providers simultaneously
- A region migrating to a new provider without rebuilding verification-dependent features
- An official electoral authority added as a provider yielding the `electoral_validated` tier
- Easy addition of new providers as the platform expands globally

### 5.2 Provider Capability Mapping

Each provider declares what it can confirm. The platform maps provider output to verification tiers:

| Provider Output | Verification Tier Awarded |
|---|---|
| Identity confirmed (name, age 18+) | `identity_verified` |
| Identity + address confirmed | `residency_verified` |
| Public official status confirmed | `official_verified` |
| Electoral authority confirmation | `electoral_validated` |

A provider that confirms only identity awards `identity_verified`. A provider that also confirms address awards `residency_verified`. The tier is determined by the provider's capability output, not by which provider is used.

### 5.3 Verification Flow

1. User initiates verification from account settings
2. User reviews the exact cost and consents to payment before proceeding
3. The platform routes to the configured provider for the user's region
4. The provider returns a result and capability output
5. On **pass**: the platform awards the appropriate tier, records any geographic area assignment, and creates a public-record entry linking the user's pseudonymous identity to their verification tier — no personally identifiable information is committed to the public record
6. On **failure**: user is notified with guidance. No ledger record is created.

### 5.4 Verification States

Every user account carries exactly one verification state at any time.

| State | Description |
|---|---|
| `unverified` | No KYC attempted or in progress |
| `pending` | KYC process initiated and in progress |
| `identity_verified` | Identity confirmed (name, age 18+) |
| `residency_verified` | Identity + address confirmed; geographic area assigned |
| `official_verified` | Verified as elected or public official via public record |
| `electoral_validated` | Validated directly by an official electoral authority *(future)* |
| `failed` | KYC completed but did not pass |
| `sponsored_pending` | Sponsorship received; KYC not yet initiated |
| `verification_not_completed` | Sponsorship received; not completed within 30 days |

### 5.5 Cost Model

Verification costs are set by the provider and vary by provider and volume tier. The platform does not subsidize or mark up these costs. Users pay the direct provider cost. The exact cost must be displayed before the user confirms payment.

### 5.6 Sponsorship System

Any registered user may pay for another user's verification. Sponsorships may target a specific named user or a user on the verification waitlist.

**Rules:**

- All sponsorship activity is permanently recorded in both the sponsor's and the recipient's public activity history. The factual record — who sponsored whom, when, and what the outcome was — is public by default.
- A sponsor may choose to act **anonymously**. Their identity is withheld, but the sponsorship event and its outcome are still recorded in the recipient's public activity.
- Sponsorship outcomes (pass, fail, or not completed) appear as factual entries in the recipient's public activity feed. No explicit judgment label is applied to the user's profile. The community draws its own conclusions from the public activity record.
- If a sponsored user does not initiate or complete KYC within **30 days** of receiving a sponsorship, their state becomes `verification_not_completed`. This is reflected in their public activity history, not as a profile badge or label.
- The platform must send a deadline reminder notification before the 30 days expire.
- `verification_not_completed` does not permanently prevent future verification. The user may pay themselves or receive a new sponsorship.
- Sponsorship payments are non-refundable once a KYC session has been initiated by the recipient.

### 5.7 Verification Waitlist

Users who want to verify but cannot afford the cost may join the public waitlist. Other users browse the waitlist and choose to sponsor an entry.

Each waitlist entry displays: the user's display name (or "Anonymous"), time on the waitlist, and whether a pending sponsorship has been received. Users may remove themselves at any time.

---

## 6. Geographic Areas

### 6.0 Canonical Vocabulary

These four terms have exact, non-overlapping meanings throughout the codebase, schema, and docs. Do not use them interchangeably. The **single source of truth** is [`GLOSSARY.md`](GLOSSARY.md) (which also lists superseded terms and the user/account vocabulary); the summary below is repeated here for the geographic-area context.

- **Jurisdiction** — the primary partition of civic identity and rules. A jurisdiction (e.g. `ab-ca-gov`, `ca-gov`) is **one chain + one rule set + one governmental level**, and is **1:1 with a chain** (the append-only ledger mechanism keeps the word "chain" only where physically accurate). A user may belong to **multiple jurisdictions**. Cryptographic identity (persona master, nullifier/dedupe root) and gating rules (expiry, censoring, change/revoke) are partitioned **per jurisdiction**.
- **Level** — a **property of a jurisdiction**: its governmental tier (`federal`, `provincial`, `municipal`, `state`, …). Level is descriptive metadata, **never** a partition key on its own.
- **District** — the electoral subdivision within a jurisdiction (riding / ward / constituency). A user is **never assigned or stored** a district; district membership is **inferred from address**, so views and vote counts can be validated by who is inside vs. outside a district or jurisdiction. District IDs carry the **boundary year** (boundaries are redrawn over time), e.g. `edmonton-strathcona-2026`. A poll/petition's gating rules default to the jurisdiction but may apply to a specific district, several districts, or the whole jurisdiction (`EntityRules.appliesToDistrictIds`).
- **Region** — the generic, app-wide term for **any filterable geographic shape**, composed **inclusively and exclusively**: a single district, a curated preset (e.g. "southern Alberta", "Edmonton", urban/rural Alberta), a whole jurisdiction's extent, or a raw shape. A region resolves to an **additive list of districts** (presets expand to additive district shapes applied to a filter). **Every district is a region; not every region is a district.** Anyone may participate in any discussion regardless of region; regions only **filter the participant set** by **containment** of the inferred address (plus later KYC status), never by storing regions on the user row. Custom regions should be defined as unions of district boundaries to limit privacy leakage; finer-than-district public breakdowns are out of scope.

### 6.1 Generic Area Model

The platform uses a generic, hierarchical geographic area model. No geographic level or terminology is hardcoded. A deployment configures its own area taxonomy at whatever granularity is appropriate for the jurisdiction.

What "areas" might be called in different deployments:

- Ridings, constituencies (Canada)
- Districts, wards (municipal)
- States, counties (US)
- Constituencies, boroughs (UK)
- Regions, departments, communes (France)
- Any other jurisdiction-specific term

The platform stores, displays, and filters by areas regardless of what they are named in a given deployment. All geographic labels in user interfaces are configurable at the deployment level and require no code changes.

### 6.2 Hierarchical Structure

Areas are organized in a configurable hierarchy. A deployment defines the levels it needs:

- Example: Ward → Municipality → Province → Country
- Example: Constituency → Region → Nation
- Example: District → State → Federal

The hierarchy is defined in deployment configuration. Filters operate at any level or combination of levels.

### 6.3 Area Membership (inferred, not assigned)

Area/district membership is **inferred from the user's address**, never stored as a district binding on the user (see `api/src/helpers/address.ts`). A single address may resolve to multiple areas at different hierarchy levels simultaneously. Resolution is done dynamically against the platform's boundary registry at query time.

Because boundaries are redrawn over time, district IDs carry a **boundary-year label** (e.g. `edmonton-strathcona-2026`) and are the stable identity of a boundary **revision**. The label is not the lookup key: which geometry applies at an instant is selected by the revision's **`effective_date`** (the boundary registry holds `effective_date`, an optional `drawn_date`, and a year-less riding key — see [`REGION-MODEL.md`](REGION-MODEL.md) and `@oursay/geo`). So a resolution is reproducible against the boundary set **in force on the action's timestamp**; audit/historical integrity comes from the address + the action's timestamp + the effective-dated boundaries — not from a frozen assignment row.

### 6.4 Filtering

All aggregate counts — belief agreements/disagreements, petition signatures, public vote results — must be filterable by:

- Any area or combination of areas in the hierarchy
- Verification tier (any combination)
- Date range

Filters must be combinable. All public-facing aggregate views, including guest-accessible views, support these filters.

### 6.5 Custom Areas

The area system supports custom area definitions. A technically capable user — such as a politician, researcher, or community organization — can define a custom area by specifying a set of existing areas or geographic boundaries. The public API returns data for any defined area, including custom ones.

This means an official can query aggregate opinion across any combination of areas, even before official geographic maps are updated, without waiting for a platform release.

---

## 7. Public API

### 7.1 Principles

The platform exposes a public, read-only API for all aggregate data. No authentication is required to access aggregate public data. The API is versioned, fully documented via an OpenAPI specification committed to the repository, and must not be so rate-limited as to prevent legitimate audit or research use.

### 7.2 What the API Exposes

- Aggregate counts for any content item (beliefs, petitions, public votes, results), filterable by area, verification tier, and date range
- Area definitions and hierarchy configuration for the deployment
- Public vote results and status
- Petition status and signature counts
- Belief agreement/disagreement counts
- Public activity summaries (no PII)
- Distributed ledger audit references for any result

### 7.3 What the API Does Not Expose

- Any personally identifiable information
- Individual user actions linked to identifiable users
- Any data not already publicly visible on the platform

### 7.4 Usage

The public API is how:
- Developers build independent dashboards and analysis tools
- Officials and researchers query opinion across any area or combination of areas
- Journalists access and verify data programmatically
- Independent auditors reproduce published results without relying on OurSay's infrastructure
- Forked deployments remain publicly accountable

Any fork or deployment must maintain a functioning public API as a condition of the license.

---

## 8. Content Model

Content on OurSay exists in a four-level hierarchy. Linkage between levels is always optional. The hierarchy represents escalating formality and consequence.

```
Beliefs  →  Petitions  →  Public Votes  →  Results
```

A belief is an informal expression of sentiment. A result is the formal, audited outcome of a community vote. Links between levels allow a result to be traced back to the beliefs that shaped it.

> **Product concepts vs. public-record types.** The names above (Belief, Petition, Public Vote, Result) are **product/public-facing concepts**. Underneath, the public record commits a small set of **generic record types**, each a primitive the platform can surface under a jurisdiction-appropriate label (consistent with §13.1, generic by design):
>
> | Product concept | Public-record type | Notes |
> |---|---|---|
> | Belief | `post` | Generic primitive; "Belief" is the Alberta deployment's label for a `post`. |
> | Petition | `petition` | |
> | (signing a petition) | `petition_signature` | A first-class record; revocable only where the petition's rules permit. |
> | Public Vote | `poll` | The question/container (generic; legally safer than "referendum"). |
> | (casting a vote) | `vote` | The signed cast ballot on a `poll`; changeable only where the poll's rules permit. |
> | Discussion comment (§10) | `comment` | A first-class committed record type. |
> | Reaction (lightweight signal) | `reaction` | A first-class committed record type (`check`/`cross`). |
> | Result (§8.4) | `result` (derived) | **Published/derived** from a closed poll — not a user append. |
>
> The implemented record types are `post`, `comment`, `reaction`, `petition`, `petition_signature`, `poll`, `vote` — each appended as create/update/delete transactions, with **per-entity governance rules** (deadlines; whether votes may change / signatures may be revoked). The set is **not fixed** — it is extensible by configuration; candidate future types include `discussion` (a topic/thread container), `bill` (a tracked legislative item), and `official_response` (an official's reply to a petition, §8.2 / §4.5). See [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) R1 and [`../public-record/README.md`](../public-record/README.md).

### 8.1 Beliefs

Informal statements that users create and others agree or disagree with. The starting point for civic conversation.

**Core attributes:** Statement/title, author (may be anonymous), creation timestamp, category/tags, links to petitions (optional, many), agree count (total | by verification tier), disagree count (total | by verification tier), discussion thread.

**Behaviour:** Any registered user may create a belief. Any registered user may agree or disagree. Users may change their position. Anonymous participation is permitted. Beliefs do not expire unless archived by an administrator.

### 8.2 Petitions

Formal calls to action that collect signatures, addressed to a specific authority.

**Core attributes:** Title, full petition text, author (may be anonymous), addressed to (may link to an official profile), links to beliefs (optional, many), links to public votes (optional, many), signature count (total | by tier), optional deadline, status (open | closed | delivered | responded), discussion thread.

**Behaviour:** Any registered user may create or sign. Signatories may include an optional comment, hidden if signing anonymously. Signatures are final by default; withdrawal before the deadline is supported only where the petition's governance rules permit it. When a petition is marked as delivered to an official with a platform account, the system notifies that official and prompts an official response.

### 8.3 Public Votes

Formal votes — binary or multiple-choice — put to the community. Carry the greatest formal weight on the platform.

**Core attributes:** Question/title, full description providing context, vote options (minimum: Yes / No; additional options permitted), author, links to petitions (optional, many), voting period (open and close timestamps), vote counts per option (total | by verification tier), status (upcoming | active | closed | result published), discussion thread.

**Behaviour:** Any registered user may vote. Anonymous voting is permitted. **Votes are final once cast by default** — the real-world analog. Changing a vote before the deadline is *technically supported but off by default*, enabled only where the poll's governance rules permit it (e.g., a riding/region whose process allows it). Voting is open for a defined period. After the period closes, a result is generated. Public vote creation may be gated by a threshold (e.g., a linked petition reaching a configurable verified signature count).

### 8.4 Results

The immutable, permanent record of a closed public vote's outcome.

**Core attributes:** Linked public vote (exactly one), final vote counts per option (total | by tier), geographic area breakdown at each hierarchy level, tier breakdown, publication timestamp, distributed ledger audit reference, discussion thread.

**Behaviour:** Immutable once published — no editing, no deletion. Publicly visible to all including guests. Results surface links back through the content hierarchy to the public vote, petitions, and beliefs. Every result is anchored on the distributed ledger for independent verification. Results are described as "designed to be tamper-resistant and permanently recorded" — not as guaranteed permanent by the platform.

### 8.5 Content Hierarchy & Linking

- A belief may link to zero or many petitions
- A petition may link to zero or many beliefs, and to zero or many public votes
- A public vote may link to zero or many petitions
- A result links to exactly one public vote

Links are directional at creation but surfaced bidirectionally for navigation. Linking is always optional and never required.

---

## 9. User Actions

### 9.1 Agreeing / Disagreeing on Beliefs

Action record includes: user identity reference (pseudonymous ledger key for verified users; off-chain account reference for unverified), timestamp, geographic area at time of action, verification tier at time of action, anonymity flag.

Counts displayed as total and broken down by verification tier. Filterable by all geographic area dimensions.

### 9.2 Signing Petitions

Functionally equivalent to a belief agreement but carries formal intent. Same recording and anonymity rules. An optional signer comment may be attached, hidden if the signature is anonymous.

### 9.3 Voting on Public Votes

- Votes are final — no changes after casting
- Verified user votes are recorded on the distributed ledger
- The ledger record links the vote to the user's pseudonymous key and the public vote record
- Anonymous verified votes are still on-ledger; the user's pseudonymous key is used, but the public display shows the verification tier only (e.g., "Residency Verified — Anonymous")

### 9.4 Anonymity Model

Any action may be taken anonymously. Anonymity means the user's display name is not shown; the action is attributed to a non-identifying token.

Anonymity does not mean the action is unverifiable by the user themselves. They retain a hash or receipt of their action and can verify it against the public ledger independently.

**Verified anonymous actions are counted in their tier totals.** The identity is not displayed; the verification tier is. These are distinct properties and must be treated as such throughout the system.

---

## 10. Discussions

Every content item — belief, petition, public vote, result — has an associated discussion thread.

**Core attributes:** Comment text, author (may be anonymous), timestamp, parent comment reference (for threaded replies), distributed ledger hash reference, engagement signal (implementation left to contributors).

**Behaviour:** Any registered user may comment, anonymously or otherwise. Comments may be reported for moderation. Administrators may remove comments that violate platform guidelines. All comments — including removed ones — have a ledger hash so users can prove a comment existed at a specific time.

---

## 11. The Public Record (Internal: immudb + external anchoring)

> **⚠️ Internal documentation only.** Never use the terms Ethereum, Solana, blockchain, cryptocurrency, wallet, keypair, or on-chain in any public-facing context. (Cryptographic hash, content commitment, Merkle root, digital signature, anchoring, and append-only record are fine in public; immudb may be named but is not required on user-facing surfaces.) Public language prefers "distributed public database," "public audit ledger," or "cryptographically verifiable public record." This document and all internal developer materials may use these terms freely.

The public record is an **append-only, tamper-evident verifiable ledger (immudb)** holding **only salted hash commitments + public metadata**, paired with a **separate mutable store (Postgres)** for raw content + salts + PII. Actions are **pooled** in Postgres, **settled** into blocks on the ledger (commitments + a `(chainId, height)` block header) on a count/age trigger, and settled blocks are then **published/anchored to external public infrastructure** on a per-target cadence — settlement and anchoring are distinct (preferred anchor: Ethereum; pluggable — see §3.4). The trust root is the **published anchor + an offline independent verifier**, not the ledger or the platform. Worked design: [`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) and [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md).

### 11.1 What Is Committed to the Public Record vs. Anchored

The public record stores, for each action, a **commitment** (a salted hash of the content) plus **public metadata** — never raw content or PII. The kinds of action committed:

- Verified participant signoffs (pseudonymous per-thread identity linked to verification tier — no PII committed)
- Public vote votes (by verified users)
- Petition signatures (by verified users)
- Post agreements and disagreements (by verified users) — "posts" are the generic record type the Alberta deployment surfaces as "Beliefs" (see §8)
- Discussion comment commitments (all registered users)
- Published result records (final counts of closed public votes — derived/published, not user-appended)
- Build hashes (production deployment records)

Commitments are committed to the ledger **in blocks at settlement** (each block carries a Merkle root over its entries); it is the **settled block** (its root / `(chainId, height)` tip) that is **published externally** — not every individual entry, and not a separate Postgres copy. Unverified user actions are stored in the mutable off-record database only.

### 11.2 Pseudonymous Identity

Each verified user controls a **master signing key per jurisdiction** (e.g. `ab-ca-gov`, `ca-gov`; governmental level is a property of the jurisdiction, not the partition key), from which **per-thread keys are derived deterministically on-device (HKDF, domain-separated)**. Authentication uses **passkeys**; key custody is the user's own device (Turnkey remains only an optional recovery path). Each action is signed by the user's **per-thread key** (a P-256 signature), whose public key is its pseudonymous identity in the public record. The platform can prove a per-thread key belongs to a verified user **without exposing which user** — via a **private registration binding** it signs at thread registration that commits the key to an **opaque per-thread commitment** (`H(user_id, salt_t, thread_id, jurisdiction)`). The binding, its per-thread salt, and the commitment opening (`user_id`, `salt_t`) are PII — known to the platform, encrypted at rest, never published — and openable by the user for self-audit or for **authorized, per-thread selective disclosure**. Each individual record (its envelope) carries only the per-thread public key, the action signature, and tier/region metadata — **never the commitment**. The opaque per-thread commitment appears solely in the platform's **settlement attestation metadata**, referenced by the per-thread public key. Nothing published links one thread to another.

A per-thread public key reveals nothing about a user's real-world identity. What the record proves: each recorded action was taken by a distinct verified participant at the recorded verification tier.

> **Device custody and multi-device policy (plain English):**
> [`08-IDENTITY-AND-DEVICE-POLICY.md`](./08-IDENTITY-AND-DEVICE-POLICY.md) — non-exportable on-device signing, platform never holds private keys, linkability when the user chooses, and multi-phone behaviour.

### 11.3 Public Auditability

Any person must be able to independently:
- Query the public record for total counts on any public vote, by tier
- Verify that each entry represents a distinct verified participant (no duplicate voting)
- Confirm that a published result matches the public record
- Reproduce any platform-published result **offline**, against the externally-anchored root, without using OurSay's tooling or servers

All public-record data structures, commitment construction, and the verification procedure must be documented in the repository so that independent auditors can verify the published data themselves.

### 11.4 User Self-Audit

Every user must be able to view all their recorded actions from within their account, access the commitment and anchor reference for each, verify each action against the public record via a direct link, and export their complete action history.

### 11.5 Required Public Language Reference

- ✅ "Your action is recorded in a distributed public database that anyone can audit"
- ✅ "Results are verified against a public, tamper-resistant ledger"
- ✅ "Every verified action is permanently recorded in a public record"
- ❌ Blockchain, Ethereum, Solana, cryptocurrency, wallet, keypair, on-chain, smart contract
- ✅ Acceptable in public when needed: cryptographic hash / digital fingerprint, content commitment, Merkle root, digital signature, anchoring, append-only record (product names like immudb are allowed but not required on user-facing surfaces)

---

## 12. Transparency & Source Code Auditability

### 12.1 Open Source

The entire codebase — backend, frontend, infrastructure-as-code, data migration scripts, and audit tooling — is published on GitHub. All committed code is readable by anyone, including adversaries. No secrets, credentials, or private keys are ever committed.

### 12.2 Build Verification

Every production deployment:
1. Produces a hash of the deployed build
2. Publishes the hash in the repository (e.g., `DEPLOYMENTS.md`)
3. Anchors the hash to external public infrastructure (see §3.4)
4. Can be independently reproduced by anyone with the published source

### 12.3 Independent Audit Tooling

The repository must include tooling allowing any person to connect to the distributed ledger, query all platform-related records, reproduce any published result, and identify discrepancies between ledger data and platform-displayed data. This tooling must function without OurSay's servers.

---

## 13. Forkability & Global Adaptability

### 13.1 Design for Any Jurisdiction

OurSay is designed to be deployed for any democratic system, anywhere in the world. Contributors must not make design decisions that assume:

- A specific country, legal system, or political structure
- A specific geographic terminology
- A specific KYC provider or verification authority
- A specific language or character set

All jurisdiction-specific configuration — area terminology, KYC providers, verification tier labels, content categories — is deployment configuration, not platform logic.

### 13.2 Fork Requirements (License-Based)

Any fork, adaptation, or deployment of OurSay must:

- Keep all source code publicly accessible and auditable
- Maintain a functioning public API for all aggregate data
- Preserve the distributed public ledger audit trail
- Not remove, obscure, or disable the audit tooling
- Display the required government non-affiliation disclaimer on all public pages (see Section 13.3)

These requirements are enforced by the platform's open source license.

> **License note for contributors:** The platform currently uses GPL v3. The requirement that *any deployment* must keep source public is more precisely served by AGPL v3, which treats network use as distribution and therefore requires source publication for hosted instances. This distinction should be resolved before the first public deployment.

### 13.3 Government Non-Affiliation Disclaimer

Every public-facing deployment must display the following disclaimer prominently on all public pages. The exact wording may be adapted for the jurisdiction, but the substance must be preserved:

> *[Platform name] is a private platform. It is not affiliated with, endorsed by, or approved by any government body or electoral authority. Identity verification is performed by a commercial third-party provider and does not constitute a determination of electoral eligibility, voter registration status, or citizenship.*

---

## 14. Notifications & Communication

The platform must notify users of events that affect them. At minimum:

- Sponsorship received — user notified when someone sponsors their verification
- Sponsorship deadline reminder — sent with sufficient notice before `verification_not_completed` is applied
- KYC result (pass or fail)
- Petition delivered to its named addressee
- Official response posted to content relevant to the user
- Activity milestones on content the user created

Notification preferences are user-configurable. Email is the baseline notification channel. All outgoing emails must comply with applicable anti-spam legislation for the deployment jurisdiction (e.g., CASL in Canada), including sender identification and a functional, easy-to-use unsubscribe mechanism. Push notifications may be added by contributors.

---

## 15. Contributor Decision-Making

When a design question is not covered by this document:

1. **Does it affect auditability?** Prefer the more auditable option.
2. **Does it affect user trust or transparency?** Prefer the more transparent option.
3. **Does it expose the distributed ledger implementation publicly?** Revise.
4. **Does it hardcode a jurisdiction-specific assumption?** Make it configurable.
5. **Is it consistent with Section 2?** Use the guiding principles as a tiebreaker.

Significant decisions — those that affect how the platform fundamentally behaves — should be proposed in a GitHub issue or RFC before implementation. Accepted decisions update this document. The document version is tracked in the repository.

---

## 16. Future Roadmap Considerations

The following are anticipated future developments. The architecture must not foreclose them.

- **Electoral authority integration:** Direct integration with official electoral bodies (e.g., Elections Alberta, Elections Canada) yielding the `electoral_validated` tier. The KYC abstraction layer and tier architecture exist to make this straightforward.
- **Global expansion:** Additional country and region configurations, localised area taxonomies, additional KYC providers.
- **Municipal layer:** Granular area definitions at ward and council level.
- **Threshold-triggered public votes:** Automatic public vote creation when a linked petition reaches a configurable verified signature count.
- **Petition delivery workflows:** Tracked, auditable delivery of petitions to named officials with response tracking.
- **Multilingual support:** Internationalisation built into the platform, not added as a patch.
- **Mobile applications:** Native iOS and Android applications.
- **Offline verification flows:** Supporting communities with limited connectivity.
