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
11. [The Distributed Public Ledger (Internal: Solana)](#11-the-distributed-public-ledger-internal-solana)
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

Internally, OurSay uses the **Solana blockchain** to store verified participant signoffs and auditable action records.

> **⚠️ Internal documentation only.** Never refer to Solana, blockchain, cryptocurrency, wallets, keypairs, or on-chain in any public-facing interface, documentation, or communication. All public-facing references use "distributed public database," "public audit ledger," or "cryptographically verifiable public record." This document and all internal developer materials may use these terms freely.

### 3.5 Build Verification

Every production deployment must produce a publicly verifiable hash, published in the repository (e.g., `DEPLOYMENTS.md`) and anchored on the distributed ledger. Any person can build the published source and confirm it matches the deployed application.

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
5. On **pass**: the platform awards the appropriate tier, records any geographic area assignment, and creates a distributed ledger record linking the user's pseudonymous identity to their verification tier — no personally identifiable information is stored on-chain
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

### 6.3 Area Assignment

When a user reaches `residency_verified`, the KYC provider's address output is mapped to one or more areas in the configured hierarchy. A single address may map to multiple areas simultaneously at different hierarchy levels.

Area assignments are stored at the time of verification. Historical area data is preserved for audit integrity — if a user re-verifies after moving, their prior actions retain the original area assignment.

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

### 8.1 Beliefs

Informal statements that users create and others agree or disagree with. The starting point for civic conversation.

**Core attributes:** Statement/title, author (may be anonymous), creation timestamp, category/tags, links to petitions (optional, many), agree count (total | by verification tier), disagree count (total | by verification tier), discussion thread.

**Behaviour:** Any registered user may create a belief. Any registered user may agree or disagree. Users may change their position. Anonymous participation is permitted. Beliefs do not expire unless archived by an administrator.

### 8.2 Petitions

Formal calls to action that collect signatures, addressed to a specific authority.

**Core attributes:** Title, full petition text, author (may be anonymous), addressed to (may link to an official profile), links to beliefs (optional, many), links to public votes (optional, many), signature count (total | by tier), optional deadline, status (open | closed | delivered | responded), discussion thread.

**Behaviour:** Any registered user may create or sign. Signatories may include an optional comment, hidden if signing anonymously. Signatures may be withdrawn. When a petition is marked as delivered to an official with a platform account, the system notifies that official and prompts an official response.

### 8.3 Public Votes

Formal votes — binary or multiple-choice — put to the community. Carry the greatest formal weight on the platform.

**Core attributes:** Question/title, full description providing context, vote options (minimum: Yes / No; additional options permitted), author, links to petitions (optional, many), voting period (open and close timestamps), vote counts per option (total | by verification tier), status (upcoming | active | closed | result published), discussion thread.

**Behaviour:** Any registered user may vote. Anonymous voting is permitted. Votes are final once cast — no changes. Voting is open for a defined period. After the period closes, a result is generated. Public vote creation may be gated by a threshold (e.g., a linked petition reaching a configurable verified signature count).

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

## 11. The Distributed Public Ledger (Internal: Solana)

> **⚠️ Internal documentation only.** Never use the terms Solana, blockchain, cryptocurrency, wallet, keypair, or on-chain in any public-facing context. All public language uses "distributed public database," "public audit ledger," or "cryptographically verifiable public record." This document and all internal developer materials may use these terms freely.

### 11.1 What Goes On-Chain

- Verified participant signoffs (pseudonymous identity linked to verification tier — no PII stored on-chain)
- Public vote votes (by verified users)
- Petition signatures (by verified users)
- Belief agreements and disagreements (by verified users)
- Discussion comment hashes (all registered users)
- Published result records (final counts of closed public votes)
- Build hashes (production deployment records)

Unverified user actions are stored in the off-chain database only.

### 11.2 Pseudonymous Identity

Each verified user has a Solana keypair. Their public key is their on-chain identity. Their private key signs their on-chain actions. The mapping between a user's platform account and their keypair is known to the platform, not published publicly, and accessible to the user themselves for self-audit purposes.

A user's public key reveals nothing about their real-world identity. What the ledger proves: each recorded action was taken by a distinct participant at the recorded verification tier.

### 11.3 Public Auditability

Any person must be able to independently:
- Query the public ledger for total counts on any public vote, by tier
- Verify that each on-chain entry represents a distinct verified participant (no duplicate voting)
- Confirm that a published result matches the on-chain record
- Reproduce any platform-published result

All on-chain data structures must be documented in the repository so that independent auditors can write their own queries without using OurSay's tooling.

### 11.4 User Self-Audit

Every user must be able to view all their on-chain actions from within their account, access the transaction ID or hash for each, verify each action against the public ledger via a direct link, and export their complete action history.

### 11.5 Required Public Language Reference

- ✅ "Your action is recorded in a distributed public database that anyone can audit"
- ✅ "Results are verified against a public, tamper-resistant ledger"
- ✅ "Every verified action is permanently recorded in a public record"
- ❌ Blockchain, Solana, cryptocurrency, wallet, keypair, on-chain, smart contract

---

## 12. Transparency & Source Code Auditability

### 12.1 Open Source

The entire codebase — backend, frontend, infrastructure-as-code, data migration scripts, and audit tooling — is published on GitHub. All committed code is readable by anyone, including adversaries. No secrets, credentials, or private keys are ever committed.

### 12.2 Build Verification

Every production deployment:
1. Produces a hash of the deployed build
2. Publishes the hash in the repository (e.g., `DEPLOYMENTS.md`)
3. Anchors the hash on the distributed ledger
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

> **License note for contributors:** The platform currently uses GPL v3. The requirement that *any deployment* must keep source public is more precisely served by AGPL v3, which treats network use as distribution and therefore requires source publication for hosted instances. This distinction should be resolved before the first public deployment. See open GitHub issue [TBD].

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
