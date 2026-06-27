# OurSay Roadmap

A horizon view: **Current → MVP → V1 → V2**, getting deliberately vaguer downstream. This is the
product/architecture arc; for the granular backend gap list and phase tags see
[`API-GAPS-AND-ROADMAP.md`](./API-GAPS-AND-ROADMAP.md), and for the agent task prompts see
[`../.agents/MVP-PROMPTS.md`](../.agents/MVP-PROMPTS.md) and
[`../.agents/CODE-ALIGNMENT-PROMPTS.md`](../.agents/CODE-ALIGNMENT-PROMPTS.md).

Vocabulary follows [`GLOSSARY.md`](./GLOSSARY.md): canonical **record types** (`post`, `petition`,
`poll`, `result`, `vote`, `petition_signature`) with per-jurisdiction **labels** (Alberta: Statement,
Petition, Poll, Result; district label `riding`).

---

## Current — landed (per `git log`)

The civic engine and read/write seams exist; there is no end-user web app yet.

- **Account auth** — email-OTP registration, account-login passkeys, recovery, gated cross-device
  login, private profile.
- **Civic identity & signing** — stable per-thread persona Pₜ, per-device WebAuthn (`webauthn-es256`)
  signing, dual-verifier, browser custody (PRF + secure-storage fallback).
- **Public record** — append-only commitments (immudb), pooled→settled→anchored write path,
  multi-chain settlement + anchoring worker.
- **Civic writes** — join → prepare → submit for all record types; `@oursay/identity` client SDK.
- **Public reads** — browse / detail / counts for the civic record.
- **Geography (Phase C, `geo-foundation`)** — PostGIS district boundaries (AB 2019 + 2023),
  `@oursay/geo` Region model + resolver, best-effort address geocoding into a private point cache,
  `ParticipantGeoService`, geo `scope` + KYC `tier` (set membership, stub provider) on counts,
  k-anonymity floor, per-jurisdiction count exposure gating (`countGating`), public area catalog.

## MVP — to launch (Alberta)

The doc-locked target the sanity sweep aligns to; several items are documented **gaps** with
code-alignment prompts in [`../.agents/CODE-ALIGNMENT-PROMPTS.md`](../.agents/CODE-ALIGNMENT-PROMPTS.md).

- **Vocabulary & content model** — `JurisdictionConfig.labels` + `contentLimits`; `PostContent`
  `title` required (≤200) / `body` optional (≤2000).
- **Thread audience** — `appliesToRegion` (riding/district/region/union, keyed off `riding_slug`) and
  `appliesToVerified` (tier set), replacing raw `appliesToDistrictIds`.
- **Identity / KYC** — Didit provider (dev ID-only + platform self-signed address; prod POA ~$2 CAD);
  `over_18` flag instead of stored birthdate.
- **Auth** — `registration` session scope (enroll first passkey only) before `full`.
- **Results** — formal derived `result` published at poll close ([mvp-c12-poll-results]).
- **Counts** — action-time geo/tier snapshots and signed count snapshots for official totals
  ([mvp-c4-action-snapshots], [mvp-c13-signed-count-snapshots]).
- **Membership** — user ↔ jurisdiction membership table; auto `oursay-global` on register.
- **Profile** — `PATCH /v1/profile` with geocode refresh.
- **Web app (Phase D)** — the end-user application over these seams.

## V1 — after launch

- **Account privacy / reveal** — visibility cascade (`thread ?? jurisdiction ?? account ??
  anonymous`; enum `anonymous | my_district | officials | public`); the reveal model (platform-
  reversible vs on-chain-nuclear) replacing `claimed`/`claimed_at`.
- **Filtering** — staged And/Or/Not composition, residency-at-time, tier sets, provider tags, deadline
  snapshots; `ever_in_region`; region presets; `my-district`.
- **Platform-signed records** — final tallies, tally amendments, censorship reasoning, district
  boundary revisions, official profiles (MLA/premier/agency).
- **Provider tags** — Equifax (`canadian_verified`); broader KYC providers per region.
- **Performance** — materialized `entity_audience` projection for district-page listing.

## V2 — horizon (deliberately vague)

- Zero-knowledge membership proofs (the reserved envelope `proof` slot) for dedupe without platform
  issuance; selective disclosure.
- Public RPC / read APIs and chain-sync for third-party verifiers.
- WYSIWYS / richer WebAuthn flows; browser plugin; native mobile apps.
- Forkable KYC and deployment for other election commissions / jurisdictions; multi-jurisdiction
  regions.
- Electoral-authority integration (e.g. Elections Alberta → `electoral_verified`) — a separate,
  higher-trust path, never implying a partnership.
