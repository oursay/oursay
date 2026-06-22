# OurSay Glossary — canonical terminology

This is the **single source of truth** for OurSay's core domain vocabulary. When code, schema, docs,
or comments use these words, they mean exactly what is written here — do not use them interchangeably.
If a term elsewhere disagrees with this file, this file wins; fix the other place.

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
  user is assigned to district(s) at residency verification. The district whose rules govern a
  specific poll/petition is its `governingDistrictId`.
- **Region** — the generic, app-wide term for **any filterable geographic shape**: a district, a
  jurisdiction's full extent, or a curated aggregate (e.g. "southern Alberta"). **Every district is a
  region; not every region is a district.** Users are resolved into regions by **containment** (district
  assignment + a region registry), never by storing every region on the user row.

## User / account vocabulary

- **handle** — optional, unique `@username` (public profile only); no spaces. `public.users.handle`.
- **display_name** — optional public display text; defaults to the handle without its `@`.
- **first_name / last_name** — private PII, used for KYC, never publicly surfaced (`auth.profiles`).
- **province** — the province/territory address component (Canada-centric storage;
  `auth.profiles.province`). Jurisdiction-specific *display* labels live in the front-end.

## Superseded terms (do not reintroduce)

| Old term | Now | Notes |
|---|---|---|
| `level` as a crypto/dedupe partition key | **jurisdiction** | level is now only a *property* of a jurisdiction |
| `levelMaster` / `level_master_keys` | `jurisdictionMaster` / `jurisdiction_master_keys` | re-keyed per (user, jurisdiction) |
| identity `region` (e.g. `"ca-ab"`) | **jurisdiction** membership | the loose per-thread region field was dropped |
| `EntityRules.region` | `governingDistrictId` | which district's rules govern a poll/petition |
| address `region` | `province` | user/profile address component |
| `users.handle` holding a free-text display name | `handle` + `display_name` (+ `first_name`/`last_name`) | one field no longer does several jobs |

## Where the vocabulary is applied

- Contributor spec, geographic area model: [`01-CONTRIBUTOR-SPEC.md` §6](01-CONTRIBUTOR-SPEC.md).
- Identity & device crypto: [`08-IDENTITY-AND-DEVICE-POLICY.md`](08-IDENTITY-AND-DEVICE-POLICY.md).
- Domain code: `public-record/src/jurisdiction.ts`, `public-record/src/governance.ts`.

> **Spikes predate this vocabulary.** Exploratory spike packages (e.g. `passkey-test/`) were written
> before the jurisdiction terminology and still use the old words (`level`, `region`). They have been
> **promoted** into `@oursay/public-record` + `@oursay/identity`, which use the terms above — treat the
> shipping packages and this glossary as authoritative, not the spikes.
