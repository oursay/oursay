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
    `{op:"and"|"or"|"not", refs}` union of these. Stable district pages key off `district_slug`, nested under their jurisdiction (e.g. `alberta/district/<district_slug>/` — slugs collide across jurisdictions). `web-app` needs updating.
    Absent ⇒ the whole jurisdiction.
  - **`appliesToVerified`** — the minimum KYC tier **set** that counts toward stake/platform totals.
  - **Entity scope** — gating rules **default to the jurisdiction**; an individual poll/petition may
    narrow them via the axes above. This spans a vote about a single local crosswalk through to
    jurisdiction-wide policy.
  - **`appliesToDistrictIds`** — the server-maintained **district-slug projection** of
    `appliesToRegion` (the `entity_audience` projection): which stable seats the stake covers, at
    the boundary revision in force. Served on read DTOs so clients can render district pills, list
    threads on district pages, and resolve the Affected filter without geometry. **Both fields are
    kept** — the RegionRef is canonical for filtering; the slug list is its display/resolution
    projection, refreshed on governance updates and boundary revisions.

## Civic content vocabulary (record types ↔ user-facing labels)

OurSay keeps a hard split between the **engineering record types** (stable, used in code, schema,
OpenAPI routes, and these docs) and the **user-facing labels** a deployment shows (configurable per
jurisdiction). **Never** use a display label as a canonical dev term.

- **Record types** (canonical, lower-case, never renamed per deployment): `post`, `petition`, `poll`,
  `result`, `vote`, `petition_signature` (plus the attachments `comment`, `reaction`). API routes use
  these — e.g. `/v1/public/posts`.
- **"Post" has two scopes.** On user-facing surfaces, "post" is the umbrella word for **any root
  record** — statement, petition, poll, or result. In backend/code/schema contexts, `post` is the
  record type for a **statement only**. In mixed contexts write **"statement post"** to
  disambiguate; any doc that leans on one scope should say which, once, near the top. Per-action
  gates apply to **all four** root types — `result` included (results are automated and attributed
  to the poll's author, via graduation or a direct post of the outcome).
- **User-facing labels** — per jurisdiction via **`JurisdictionConfig.labels`** (post / petition / poll
  / result / district). Defaults: **Statement, Petition, Poll, Result**. Alberta launch (`ab-ca-gov`):
  **Statement** for `post`, **riding** for the district label. `oursay-global` = all defaults.
- **Content hierarchy** (product): **Statement → Petition → Poll → Result**. Internal:
  `post → petition → poll → result`.
- **Ladder / graduation** — the four content levels form a **ladder**; **graduation** is a lower level
  producing the next (petition → poll; poll → result). Whether climbing is required, who may create at
  each level, and whether graduation is automatic are **per-jurisdiction** config (the `gates` map;
  see [`01-CONTRIBUTOR-SPEC.md` §8.6](01-CONTRIBUTOR-SPEC.md) and
  [`entities/partitioning/jurisdiction.md`](entities/partitioning/jurisdiction.md)). Launch models:
  `oursay-global` — anyone may create at any level; `ab-ca-gov` — posts open, petitions
  residency-verified, polls **official-role only** or via graduation. A
  **threshold-triggered poll** is the automatic graduation of a petition into a poll when it
  reaches the configured threshold — the poll is **forced whether or not an official agrees**, and
  the **proposing user remains the poll's author**. An AB official-role holder may also **manually
  graduate a petition into a poll at any point** (promote early); neither path affects the petition
  itself — users keep signing while it is open, and only its **deadline** closes it.
- **Gate (per-action)** — a jurisdiction's per-action policy triple, set **per jurisdiction per record type**: **act** (who may perform it: anyone / tier set / jurisdiction residency / role — optionally minus a denied role), **signMin** (minimum sign method), and **platformCount** (who is included in the platform-count totals). "**Jurisdiction residency**" is the gate kind `residency_verified` AND geocoded point inside the jurisdiction's region. "**Sign now, verify later**": an open act gate with a stricter platform-count gate — the action lands immediately and is included in the platform count once (and while) the author meets it, recomputed at read time.
- **Platform count (gate)** — a **counting floor, not a participation barrier**: it decides which actions are included in the platform-signed platform totals, *after* the action. Anyone the act gate admits is welcome to participate; actions below the floor are bunched into the **unverified** counts until the author verifies to the required tier. The platform-count gate always uses the **act gate as its floor** (it can only be stricter). Never phrase it as eligibility to act.
- **Platform count (record)** — a platform-authored record type appended to the public record: a signed snapshot of every eligible signature/vote and each participant's status (`id_verified`, `residency_verified[none | jurisdiction | affected]`, `official_role` — not count-eligible in AB for petition signatures), amendable with a per-entry reason tag. Anyone can validate their own participation and what the record shows they said — on platform, or via an auditor checking against **personas, not profiles**. See [`entities/record/future.md`](entities/record/future.md).
- **Official (role)** — platform-assigned, revocable authority (e.g. a seated MLA) attached to the
  user/jurisdiction membership. A **role, not a KYC tier** — tiers stay pure verification facts.
  Granted after **manual platform validation**: identity verification at minimum, residency
  preferred (not required — an official may live outside the district they represent, so
  in-district filter logic is **forced to the represented district**, not the home address).
  `identity_verified` (min) + the official role = the composite **official verification** status.
  **Suffix discipline:** always write **official role**, **platform count**, or **official verification** — never a bare "official" where the sense is ambiguous.
- **Threshold (graduation / success)** — a petition-success or poll-graduation trigger: a **fixed
  number** or a **percentage of the jurisdiction's verified users** (a moving target, or frozen at
  creation time). Decided by the **platform from jurisdiction config at creation time** — never set
  per entity by the author. AB plan: percentage-based moving target until the user base is large
  enough, then a fixed number (10% of valid votes cast in the previous provincial election) or
  better. Reaching a threshold **does not close the petition** — the deadline is the only closing.
- **Root entity** — a `post` / `petition` / `poll`: a thread root that carries the thread audience.
  Every root entity is **bound to exactly one jurisdiction** (`jurisdictionId`); absent an explicit
  choice it defaults to **`oursay-global`**. Comments, reactions, votes, and signatures inherit their
  root's jurisdiction and audience.
- **Statement** — the Alberta/default product label for a `post` (the informal, lowest-formality civic
  content type). Replaces the retired product term *Belief*.
- **Poll** — the product label for a `poll` (formal vote container). Replaces the retired product term
  *Public Vote*. A user's individual ballot is a **`vote`**; "public vote" refers **only** to that
  ballot, never to the poll container.
- **vote / petition_signature** — a user's individual ballot on a poll / signature on a petition.
  Signed with at least the jurisdiction's per-action floor (`gates[action].signMin`): `ab-ca-gov`
  requires passkey (`webauthn-es256`); `oursay-global` accepts quick-sign (`p256`).   **Changeable by default** at the platform layer — the loose default (`allowChange` true) is intentional and covers both vote change and signature revoke; a jurisdiction tightens to final via its config, never the platform default (`ab-ca-gov` launch: `allowChange: false`).
- **Sign method / signing preference** — how a civic action is authorised on-device:
  **quick** (derived thread key, `p256`, no prompt) · **ask** (per-action chooser) · **passkey**
  (WebAuthn, user-verifying). The account holds a per-action preference; the jurisdiction sets a
  per-action minimum; the **strongest wins** — a preference can raise but never lower a floor.
- **Quick sign** — the `p256` derived-key signing path. A first-class production method (not a
  deprecated legacy path); the floor for every action on `oursay-global` and for
  comments/reactions on `ab-ca-gov`.
- **signTier** — the per-transaction signing-strength projection surfaced on read DTOs and the
  Signed filter: `0` quick-sign · `1` passkey · `2` fingerprint / `3` face (future biometric).
  Derived from envelope `signScheme` + authenticator UV/metadata; orthogonal to KYC tier.

## User / account vocabulary

- **handle** — **required**, unique `@username` (public profile only); no spaces.
  `public.users.handle` (NOT NULL target; column is nullable today — migration pending). Collected
  at registration. A private account keeps its handle — privacy is the explicit visibility setting
  ([`09-ACCOUNT-PRIVACY-MODEL.md`](09-ACCOUNT-PRIVACY-MODEL.md)), never a null handle.
- **display_name** — public display text. **Optional at registration** — when unfilled it defaults
  to the handle (without the `@`), so it is never null on a public surface (NOT NULL target,
  server-filled from the handle).
- **first_name / last_name** — private PII, used for KYC, never publicly surfaced (`auth.profiles`).
- **province** — the province/territory address component (Canada-centric storage;
  `auth.profiles.province`). Jurisdiction-specific *display* labels live in the front-end.
- **over_18** — the age-gate boolean. Self-attested via a checkbox at registration and re-verified
  factually at the KYC step; the platform needs only "is this account an adult", never a date of
  birth, so the stored `birthdate` column is dropped (target). Today the age gate stores
  `auth.profiles.birthdate` (DATE) and computes 18+ at registration — see the superseded-terms
  table and [`account/future.md`](entities/account/future.md).
- **Jurisdiction membership** — a user belongs to one or more jurisdictions via a membership table;
  every account is auto-subscribed to **`oursay-global`** at registration. Future: geocode-suggested
  subscription prompts.
- **Reveal** — the act of linking a pseudonymous thread persona (Pₜ) to a public profile. Replaces the
  old `claimed` / `claimed_at` flow. A **platform reveal** is reversible (off-ledger); an **on-chain
  reveal** is nuclear (permanent). See [`09-ACCOUNT-PRIVACY-MODEL.md`](09-ACCOUNT-PRIVACY-MODEL.md) and
  [`account/future.md`](entities/account/future.md).
- **Mention node** — a stable opaque mention target for one `(thread_id, mentioned_user_id)` pair (`mention_map`). The committed body stores only an inline **mention token** (`<@` + base59(UUID v4 node id) + `>`); never `@handle`, reserved label, persona name, or profile display. See [`entities/civic-identity/mention-node.md`](entities/civic-identity/mention-node.md).
- **Reserved label** — the pre-join display string for a mention node (random mint + collision retry, persisted on `mention_map`). **Not** derived from `user_id` (unlike persona names, which are seeded from public Pₜ). Soft-mode: reserved until the mentioned user joins and mints Pₜ; then the same node resolves to persona or profile per viewer privilege. Unresolved mentions use fixed **Someone**.
- **Mention index** — write-time projection (`mention_index`) of which transactions mention which users, built by parsing committed tokens → `mention_map` (never by scanning free-text `@handle`). Powers profile/persona Mentions tabs.

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
| `EntityRules.region` (loose string) | **`appliesToRegion`** + **`appliesToDistrictIds`** | the geographic stake is a RegionRef (`appliesToRegion`, drives count filtering); `appliesToDistrictIds` is its server-maintained **district-slug projection** for per-thread district display/resolution — both are kept, neither deprecates the other (see Thread audience) |
| `riding_slug` / `ridingSlug` (district key) | **`district_slug`** / **`districtSlug`** | year-less logical-seat key; backend uses "district" (a jurisdiction may still *display* "riding" via labels) |
| address `region` | `province` | user/profile address component |
| `users.handle` holding a free-text display name | `handle` + `display_name` (+ `first_name`/`last_name`) | one field no longer does several jobs |
| product term **Belief** | **Statement** (label for `post`) | "Belief" is retired as a product label; record type stays `post` |
| product term **Public Vote** | **Poll** (label for `poll`) | "Public Vote"/"public vote" now means only a user's `vote` ballot, never the poll container |
| `thread_keys.claimed` / `claimed_at` | **reveal model** | persona→profile linking is now the reveal flow (platform-reversible vs on-chain-nuclear); the columns remain until migration |
| `auth.profiles.birthdate` (stored DATE) | **`over_18`** (boolean target) | store only the adult flag if age can be re-prompted; column remains until migration |
| KYC provider `equifax` (MVP) | **`didit`** (MVP) | Didit is the MVP provider; Equifax/electoral are future provider tags |
| **official count** (totals axis) | **platform count** | avoids confusion with official *role* or official *verification*; gate field **`platformCount`** |
| **`allowRevoke`** (petition-only flag) | **`allowChange`** (unified) | one flag for vote change and signature revoke; deadline gates both submit and change/revoke |
| **`officialCount`** (gate field) | **`platformCount`** | suffix discipline — platform *count*, not official *role* |

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
