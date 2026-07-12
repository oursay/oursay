# OurSay Roadmap

A horizon view: **Current → MVP → V1 → V2**, getting deliberately vaguer downstream. This is the
product/architecture arc; for the granular backend gap list and phase tags see
[`API-GAPS-AND-ROADMAP.md`](./API-GAPS-AND-ROADMAP.md), and for the agent task prompts see
the local agent playbooks. <!-- see .agents/MVP-PROMPTS.md and .agents/CODE-ALIGNMENT-PROMPTS.md -->

Vocabulary follows [`GLOSSARY.md`](./GLOSSARY.md): canonical **record types** (`post`, `petition`,
`poll`, `result`, `vote`, `petition_signature`) with per-jurisdiction **labels** (Alberta: Statement,
Petition, Poll, Result; district label `riding`).

---

## Current — landed (per `git log`)

The civic engine, read/write seams, and the web app (wired to the live API) all exist.

- **Account auth** — email-OTP registration, account-login passkeys, recovery, gated cross-device login, private profile.
- **Civic identity & signing** — stable per-thread persona Pₜ, per-device WebAuthn (`webauthn-es256`) signing plus the `p256` quick-sign path (both production methods), browser custody (PRF + secure-storage fallback).
- **Public record** — append-only commitments (immudb), pooled→settled→anchored write path, multi-chain settlement + anchoring worker.
- **Civic writes** — join → prepare → submit for all record types; `@oursay/identity` client SDK.
- **Public reads** — browse / detail / counts for the civic record.
- **Geography (Phase C, `geo-foundation`)** — PostGIS district boundaries (AB 2019 + 2023), `@oursay/geo` Region model + resolver, best-effort address geocoding into a private point cache, `ParticipantGeoService`, geo `scope` + KYC `tier` (set membership, stub provider) on counts, k-anonymity floor, per-jurisdiction count exposure gating (`countGating`), public area catalog.
- **Web app (Bridge MVP)** — Next.js app wired to the live API through a same-origin `/v1/*` proxy (mock corpus kept behind `NEXT_PUBLIC_MOCK_ONLY`); dev DB seed (`npm run seed`); e2e smoke over the live HTTP surface (`api/test/35-e2e-smoke.spec.ts`). **Deferred:** Didit hosted-session KYC in the UI (backend done + sandbox-proven; Get-Verified still dev-attest — gaps A/B, tracked in API-GAPS-AND-ROADMAP.md); dev default stays dev-attest.

## MVP — to launch (Alberta)

The doc-locked target the sanity sweep aligns to; several items are documented **gaps** with
code-alignment prompts. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

- **Vocabulary & content model** — `JurisdictionConfig.labels` + `contentLimits`; `PostContent` `title` required (≤200) / `body` optional (≤2000).
- **Thread audience** — `appliesToRegion` (district/revision/region/union, keyed off `district_slug`; **shipped**) and `appliesToVerified` (tier set); `appliesToDistrictIds` **kept** as the region's served district-slug projection, maintained by the `entity_audience` projection (promoted from V1 performance work to MVP — it powers per-thread district resolution and district pages).
- **Signing gates & prefs** — per-jurisdiction per-action gates (`act` (+ `deny`) / `signMin` / `platformCount`, incl. jurisdiction-residency and official-role gate kinds; the platform count is a counting floor after the action, never a participation barrier) replacing the platform-wide vote/signature scheme hard-override; per-account per-action signing preferences (quick/ask/passkey, strongest wins); `signTier` projection on read DTOs.
- **Identity / KYC** — Didit provider (dev ID-only + platform self-signed address; prod POA); verification **free to users**, platform pays Didit, funded by optional GitHub Sponsors donations (soft-ask before session open); `over_18` checkbox at signup (KYC re-verifies) instead of stored birthdate; **least-resistance registration** (handle + over_18 required; display name optional — falls back to handle; full name/address optional at signup behind a helper, else collected at KYC).
- **Account privacy** — visibility ships with 4 values (`anonymous | officials | my_district | public`; `officials` = officials affected by the post), cascade `thread ?? account ?? anonymous` (thread override may widen or narrow; default `anonymous`), private profiles 404 out-of-scope, persona display names + persona pages (moved up from V1 — the web-app demo specifies it).
- **Auth** — `registration` session scope (enroll first passkey only) before `full`.
- **Results** — formal derived `result` published at poll close ([mvp-c12-poll-results]).
- **Counts** — action-time geo/tier snapshots and signed count snapshots for platform totals ([mvp-c4-action-snapshots], [mvp-c13-signed-count-snapshots]).
- **Multi-jurisdiction foundation** — user ↔ jurisdiction membership table (auto `oursay-global` on register); every root entity bound to a jurisdiction (`jurisdictionId`, default `oursay-global`); the UI **jurisdiction-selector + unified-feed components** built to work with a single active chain. A *populated* cross-jurisdiction feed across multiple live chains is **best-effort** (may slip; `[mvp-c10-multi-jurisdiction]`).
- **Profile** — `PATCH /v1/profile` with geocode refresh.
- **Web app (Phase D)** — the end-user application over these seams.

## V1 — after launch

- **Reveal & privacy extensions** — the reveal model (platform-reversible vs on-chain-nuclear) replacing `claimed`/`claimed_at`; the optional **per-jurisdiction** visibility override layer (the MVP cascade is `thread ?? account ?? anonymous` — see [09-ACCOUNT-PRIVACY-MODEL.md](./09-ACCOUNT-PRIVACY-MODEL.md)).
- **Filtering** — staged And/Or/Not composition, residency-at-time, tier sets, provider tags, deadline snapshots; `ever_in_region`; region presets; `my-district`.
- **Platform-signed records** — final tallies, tally amendments, censorship reasoning, district boundary revisions, official profiles (MLA/premier/agency).
- **Provider tags** — Equifax (`canadian_verified`); broader KYC providers per region.
- **Performance** — further read-model projections (feed, profile activity, mentions) as load demands (`entity_audience` itself is MVP — see Thread audience above).
- **Donation pressure / funding contingency** — if GitHub Sponsors soft-asks underfund capacity: escalate to invasive banners and popups; if donations still collapse, fall back to pay-per-verification (and optionally peer sponsorship / waitlist per contributor §5.6–5.7). Do not build the charge path until this contingency is declared.

## V2 — horizon (deliberately vague)

- Zero-knowledge membership proofs (the reserved envelope `proof` slot) for dedupe without platform issuance; selective disclosure.
- Public RPC / read APIs and chain-sync for third-party verifiers.
- WYSIWYS / richer WebAuthn flows; browser plugin; native mobile apps.
- Forkable KYC and deployment for other election commissions / jurisdictions; multi-jurisdiction regions.
- Electoral-authority integration (e.g. Elections Alberta → `electoral_verified`) — a separate, higher-trust path, never implying a partnership.
