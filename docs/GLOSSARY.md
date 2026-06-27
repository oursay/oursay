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
- **Entity scope (poll/petition)** — gating rules **default to the jurisdiction**, but an individual
  poll/petition may apply to a **specific district, several districts, or the whole jurisdiction**
  (`EntityRules.appliesToDistrictIds`; absent/empty = the whole jurisdiction). This spans a vote about
  a single local crosswalk through to jurisdiction-wide policy.

## User / account vocabulary

- **handle** — optional, unique `@username` (public profile only); no spaces. `public.users.handle`.
- **display_name** — optional public display text; defaults to the handle without its `@`.
- **first_name / last_name** — private PII, used for KYC, never publicly surfaced (`auth.profiles`).
- **province** — the province/territory address component (Canada-centric storage;
  `auth.profiles.province`). Jurisdiction-specific *display* labels live in the front-end.

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

## Superseded terms (do not reintroduce)

| Old term | Now | Notes |
|---|---|---|
| `level` as a crypto/dedupe partition key | **jurisdiction** | level is now only a *property* of a jurisdiction |
| `levelMaster` / `level_master_keys` | `jurisdictionMaster` / `jurisdiction_master_keys` | re-keyed per (user, jurisdiction) |
| identity `region` (e.g. `"ca-ab"`) | **jurisdiction** membership | the loose per-thread region field was dropped |
| `EntityRules.region` | `appliesToDistrictIds` | which district(s) a poll/petition applies to (absent = whole jurisdiction); never a single "governing" district |
| address `region` | `province` | user/profile address component |
| `users.handle` holding a free-text display name | `handle` + `display_name` (+ `first_name`/`last_name`) | one field no longer does several jobs |

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
