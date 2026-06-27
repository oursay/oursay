# OurSay Glossary — canonical terminology

This is the **single source of truth** for OurSay's core domain vocabulary. When code, schema, docs,
or comments use these words, they mean exactly what is written here — do not use them interchangeably.
If a term elsewhere disagrees with this file, this file wins; fix the other place.

> **Formal object specs:** This glossary defines *terms*. Structured attributes, states, invariants,
> and implementation paths for each domain object live in [`entities/README.md`](entities/README.md).

## Core terms

- **Jurisdiction** — the primary partition of civic identity and rules. A jurisdiction (e.g.
  `ab-ca-gov`, `ca-gov`) is **one chain + one rule set + one governmental level**, and is **1:1 with a
  chain** (the append-only ledger keeps the word "chain" only where physically accurate — e.g.
  `record_outbox.chain_id`). A user may belong to **multiple jurisdictions**. Cryptographic identity
  (persona master, nullifier/dedupe root) and gating rules (expiry, censoring, change/revoke) are
  partitioned **per jurisdiction**. Code: `jurisdictionId`; the deployment default is
  `jurisdictionConfig` (`public-record/src/jurisdiction.ts`).
- **Level** — a **property of a jurisdiction**: its governmental tier (`federal`, `provincial`,
  `municipal`, `state`, …). Descriptive metadata, **never** a partition key on its own.
- **District** — the electoral subdivision within a jurisdiction (riding / ward / constituency). A
  user is **never assigned or stored** a district; district membership is **inferred from the user's
  address**. This lets users and representatives see — and validate vote counts by — who is inside
  vs. outside a given district or jurisdiction. A district id is the stable identity of a **boundary
  revision** and carries a **year label** (boundaries are redrawn over time), e.g.
  `edmonton-strathcona-2026`. The year is a label, not the lookup key: **which geometry applies at an
  instant is selected by the revision's `effective_date`**, so reproducibility comes from
  `effective_date` + the address/action timestamp, not the year alone. Boundaries live in
  `@oursay/geo` (`geo.districts`, PostGIS).
- **Region** — the generic, app-wide term for **any filterable geographic shape**, composed
  **inclusively and exclusively**: a single district, a curated preset (e.g. "southern Alberta",
  urban/rural), a whole jurisdiction's extent, or a raw shape. A region is stored as a shape and, for
  the platform's purposes, resolves to an **additive list of districts** (presets just expand to
  additive district shapes applied to a filter). **Every district is a region; not every region is a
  district.** Concretely (`@oursay/geo` `Region` / `RegionResolver`) the kinds are: **single district**,
  **district union**, **whole-jurisdiction extent** (one revision per riding, as of an instant), and
  **custom geometry** (a stored preset). Filter code calls `region.contains(point)` and never branches
  on raw district-id lists. Anyone on the platform may participate in any discussion regardless of
  region; regions are used to **filter the participant set** (by containment of the inferred address,
  plus later KYC status), never stored on the user row.
- **Thread audience** — the stake declared on a **root entity** (`post` / `petition` / `poll`); votes,
  comments, and reactions **inherit** it from their root. Two orthogonal axes (both target shape;
  see [`entities/partitioning/entity-rules.md`](entities/partitioning/entity-rules.md)):
  - **`jurisdictionId`** — required on every thread; the partition the thread lives in.
  - **`appliesToRegion`** — the *geographic* stake (a RegionRef): `"jurisdiction"`,
    `"district:<district_slug>"` (a stable seat, resolved to the revision in force at `asOf`),
    `"revision:<revisionId>"` (a pinned boundary version), `"region:<presetId>"`, or an
    `{op:"and"|"or"|"not", refs}` union of these. Stable district pages key off `district_slug`.
    Absent ⇒ the whole jurisdiction.
  - **`appliesToVerified`** — the minimum KYC tier **set** that counts toward stake/official totals.
  - **Entity scope** — gating rules **default to the jurisdiction**; an individual poll/petition may
    narrow them via the axes above. This spans a vote about a single local crosswalk through to
    jurisdiction-wide policy.
  > **Deprecated:** `EntityRules.appliesToDistrictIds` (raw district-id array) remains accepted in code
  > as an alias — mapped internally to an OR-of-revisions `appliesToRegion` — but is superseded by
  > `appliesToRegion`. See the superseded-terms table.

## Civic content vocabulary (record types ↔ user-facing labels)

OurSay keeps a hard split between the **engineering record types** (stable, used in code, schema,
OpenAPI routes, and these docs) and the **user-facing labels** a deployment shows (configurable per
jurisdiction). **Never** use a display label as a canonical dev term.

- **Record types** (canonical, lower-case, never renamed per deployment): `post`, `petition`, `poll`,
  `result`, `vote`, `petition_signature` (plus the attachments `comment`, `reaction`). API routes use
  these — e.g. `/v1/public/posts`.
- **User-facing labels** — per jurisdiction via **`JurisdictionConfig.labels`** (post / petition / poll
  / result / district). Defaults: **Statement, Petition, Poll, Result**. Alberta launch (`ab-ca-gov`):
  **Statement** for `post`, **riding** for the district label. `oursay-global` = all defaults.
- **Content hierarchy** (product): **Statement → Petition → Poll → Result**. Internal:
  `post → petition → poll → result`.
- **Statement** — the Alberta/default product label for a `post` (the informal, lowest-formality civic
  content type). Replaces the retired product term *Belief*.
- **Poll** — the product label for a `poll` (formal vote container). Replaces the retired product term
  *Public Vote*. A user's individual ballot is a **`vote`**; "public vote" refers **only** to that
  ballot, never to the poll container.
- **vote / petition_signature** — a user's individual ballot on a poll / signature on a petition. Both
  MUST be signed `webauthn-es256`.

## User / account vocabulary

- **handle** — optional, unique `@username` (public profile only); no spaces. `public.users.handle`.
- **display_name** — optional public display text; defaults to the handle without its `@`.
- **first_name / last_name** — private PII, used for KYC, never publicly surfaced (`auth.profiles`).
- **province** — the province/territory address component (Canada-centric storage;
  `auth.profiles.province`). Jurisdiction-specific *display* labels live in the front-end.
- **over_18** — the age-gate result (target: a boolean). The platform needs only "is this account an
  adult", not a date of birth; if the KYC/recovery flow can re-prompt for age, the stored `birthdate`
  column is dropped. Today the age gate stores `auth.profiles.birthdate` (DATE) and computes 18+ at
  registration — see the superseded-terms table and [`account/future.md`](entities/account/future.md).
- **Jurisdiction membership** — a user belongs to one or more jurisdictions via a membership table;
  every account is auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested
  subscription prompts.
- **Reveal** — the act of linking a pseudonymous thread persona (Pₜ) to a public profile. Replaces the
  old `claimed` / `claimed_at` flow. A **platform reveal** is reversible (off-ledger); an **on-chain
  reveal** is nuclear (permanent). See [`09-ACCOUNT-PRIVACY-MODEL.md`](09-ACCOUNT-PRIVACY-MODEL.md) and
  [`account/future.md`](entities/account/future.md).

## Verification vocabulary

- **Verification tier** — a KYC level resolved by **set membership**, never a strict ladder (see
  [`account/verification.md`](entities/account/verification.md)). Tiers and **provider tags** are
  orthogonal — a tier says *how verified*, a provider tag says *who attested*.
- **Didit** — the MVP KYC provider. **Dev:** ID-only verification (free) + a platform self-signed
  address KYC (POA-ready). **Prod:** Didit proof-of-address (POA) verification, ~$2 CAD/check. Equifax
  (`canadian_verified`) and election commission KYC (`electoral_verified`) provider tags are future only.
  Residency verification is **never** electoral eligibility, and OurSay must **never** imply a partnership with government or authority. Today the provider enum is `stub | equifax` — see the superseded-terms
  table and [`account/future.md`](entities/account/future.md).

## Auth / device vocabulary

- **Account-login passkey** — a WebAuthn credential that proves *who is logged in*
  (`auth.passkey_credentials`). The preferred, day-to-day auth factor. **Multi-device**: a user may
  have several (one per device). **Never** signs the public record. Distinct from a *civic device key*.
- **Civic device key** — a per-user public signing key (`public.device_keys`, the *Dᵢ* of
  [`08` §5.4](08-IDENTITY-AND-DEVICE-POLICY.md)) used to sign public-record actions on-device. The
  platform holds the **public key only**. Enrolled after login via `/v1/civic/devices`. Distinct from
  an *account-login passkey*.
- **OTP purpose** — the discriminator on every email one-time code (`auth.email_otp.purpose`), one of
  **`registration`** (first-time bootstrap), **`recovery`** (lost passkey), **`login`** (gated
  cross-device sign-in). All codes are requested through the single endpoint `POST /v1/auth/otp/request`.
  Email OTP is **never a standing login method** — only these three purposes.
- **Add device** — enrolling an *additional* account-login passkey from an already-trusted full
  session. **Additive** (keeps other sessions). Contrast with *recovery*.
- **Gated login** — signing in on a new/unenrolled device via a `login` OTP that only works after a
  trusted device opens the **login enable window**. Yields a limited (enroll-only) session; the device
  then enrolls a passkey and logs in with it. Additive — does **not** revoke other sessions.
- **Login enable window** — the short-lived authorization (the active `login` OTP itself, bounded by
  `OTP_TTL_SEC`, one per account) created by `POST /v1/auth/login/enable` from a trusted device. While
  open, a `login` code may be sent/verified; while closed, login OTP requests are silent no-ops.
- **Session scope** — `auth.sessions.scope`: **`full`** (complete access) vs the limited
  **`recovery`** and **`login`** scopes, which may *only* enroll a passkey. Recovery **revokes all
  prior sessions**; login does not.
  > **Target (code gap):** OTP registration should yield a limited **`registration`** scope (enroll the
  > first passkey only); a `full` session is issued **after** the user logs in with that passkey. Today
  > registration issues `full` directly — see [`auth/future.md`](entities/auth/future.md) and the
  > superseded-terms table.
- **Passkey enrollment** — one account-login passkey per **enrolled authenticator** (device/security
  key). A user may enroll several across devices.

## Superseded terms (do not reintroduce)

| Old term | Now | Notes |
|---|---|---|
| `level` as a crypto/dedupe partition key | **jurisdiction** | level is now only a *property* of a jurisdiction |
| `levelMaster` / `level_master_keys` | `jurisdictionMaster` / `jurisdiction_master_keys` | re-keyed per (user, jurisdiction) |
| identity `region` (e.g. `"ca-ab"`) | **jurisdiction** membership | the loose per-thread region field was dropped |
| `EntityRules.region` / `appliesToDistrictIds` | **`appliesToRegion`** | the geographic stake of a thread (a RegionRef); `appliesToDistrictIds` (raw district-id array) is a deprecated alias, mapped internally to an OR-of-revisions RegionRef (see Thread audience) |
| `riding_slug` / `ridingSlug` (district key) | **`district_slug`** / **`districtSlug`** | year-less logical-seat key; backend uses "district" (a jurisdiction may still *display* "riding" via labels) |
| address `region` | `province` | user/profile address component |
| `users.handle` holding a free-text display name | `handle` + `display_name` (+ `first_name`/`last_name`) | one field no longer does several jobs |
| product term **Belief** | **Statement** (label for `post`) | "Belief" is retired as a product label; record type stays `post` |
| product term **Public Vote** | **Poll** (label for `poll`) | "Public Vote"/"public vote" now means only a user's `vote` ballot, never the poll container |
| `thread_keys.claimed` / `claimed_at` | **reveal model** | persona→profile linking is now the reveal flow (platform-reversible vs on-chain-nuclear); the columns remain until migration |
| `auth.profiles.birthdate` (stored DATE) | **`over_18`** (boolean target) | store only the adult flag if age can be re-prompted; column remains until migration |
| KYC provider `equifax` (MVP) | **`didit`** (MVP) | Didit is the MVP provider; Equifax/electoral are future provider tags |

## Where the vocabulary is applied

- Contributor spec, geographic area model: [`01-CONTRIBUTOR-SPEC.md` §6](01-CONTRIBUTOR-SPEC.md).
- Region model → schema → resolution, and effective-dated boundaries: [`REGION-MODEL.md`](REGION-MODEL.md).
- Identity & device crypto: [`08-IDENTITY-AND-DEVICE-POLICY.md`](08-IDENTITY-AND-DEVICE-POLICY.md).
- Domain code: `public-record/src/jurisdiction.ts`, `public-record/src/governance.ts`; boundaries +
  regions: `@oursay/geo` (`geo/src/region-resolver.ts`, `geo/src/store.ts`).

> **Spikes predate this vocabulary.** Exploratory spike packages (e.g. `passkey-test/`) were written
> before the jurisdiction terminology and still use the old words (`level`, `region`). They have been
> **promoted** into `@oursay/public-record` + `@oursay/identity`, which use the terms above — treat the
> shipping packages and this glossary as authoritative, not the spikes.
