# API gaps and pre-UI roadmap

> **📍 For the product horizon (Current → MVP → V1 → V2), see [`ROADMAP.md`](./ROADMAP.md).** This file is the granular, backend-facing companion: what `@oursay/api` does today, what is stubbed or missing, and the phase-tagged work behind it. It is **not** deprecated — `ROADMAP.md` links here for detail.

What `@oursay/api` and the civic read/write surface **do today**, what is **stubbed or missing**, and suggested **backend work before Phase D (web app)**. UI planning stays deferred until these seams are stable — especially jurisdiction policy, membership, and how platform counts are advertised.

**See also:** [`api/README.md`](../api/README.md) (operational detail) · [`REGION-MODEL.md`](./REGION-MODEL.md) (region-first filtering) · [`GLOSSARY.md`](./GLOSSARY.md) · [`01-CONTRIBUTOR-SPEC.md`](./01-CONTRIBUTOR-SPEC.md) §6–7

---

## What is landed

### Account and civic core (Phase A + B read)

| Area | Notes |
|------|--------|
| Account auth | OTP register, passkeys, recovery, gated cross-device login, private profile |
| Civic writes | WebAuthn per-thread signing; join → prepare → submit for all record types |
| Client SDK | `@oursay/identity` `CivicHttpClient` |
| Settlement | Worker settles `oursay-global` + `ab-ca-gov` (`WORKER_CHAIN_IDS`) |
| Public read | `GET /v1/public/{posts,petitions,polls}` list, `/:id` detail, `/:id/counts` |
| Explorer / auditor (interim) | `GET /v1/explorer/:chainId` tip + type counts; `/blocks`, `/blocks/:height`, `/txs?block=`, `/tx/:txId` (Base59). **Not** a full sync/stream — that remains a launch gap |
| Browse/detail tallies | Post reactions are **unfiltered** totals; petition/poll signature/vote scalars are policy-gated (null + `countGating` under a withholding/tier-gating jurisdiction) but never geo/tier-*filtered* on list/detail (by design — see below) |

### Phase C — geography and count filtering (landed on `geo-foundation`)

| Piece | Package / location |
|-------|-------------------|
| PostGIS + district boundaries | `@oursay/geo` — effective-dated `geo.districts`, shapefile ingest (EA 2019 + 2023) |
| Region model | `Region`, `RegionResolver` — district, union, jurisdiction, custom preset kinds; `region.contains(point)` |
| Custom region storage | `geo.regions` table (presets only; **no HTTP CRUD yet**) |
| Profile geocode cache | `auth.profile_geocodes` (current point) + `auth.profile_geocode_history` (append-only) |
| Geocoding | `GeocodeService` — best-effort on register; `stub` / `geocodio` providers |
| Participant linkage | `ParticipantGeoService` — persona or nullifier → user → point → `participantInRegion` |
| Geo on counts | `scope` → `compileScope` → `Region`; live on `…/:id/counts` only (`current` point mode) |
| Tier on counts | Repeatable `?tier=` **set membership** (not a ladder); `KycService` + stub provider; dev `POST /v1/dev/kyc/attest` |
| k-anonymity | Suppresses narrow buckets when geo or tier narrows; floor from env + `JurisdictionConfig.privacy` |
| Jurisdiction config | `@oursay/jurisdiction-data` workspace exports `JurisdictionConfig[]`; API registers **all** at startup (`oursay-global` + `ab-ca-gov`), not just the env default |
| Count exposure (`countGating`) | Per-jurisdiction `JurisdictionConfig.counts` drives `none`/`withheld`/`tier-gated` on petition/poll list+detail+counts; `ab-ca-gov` tier-gates vote/signature scalars, `oursay-global` is permissive |
| Area catalog (`[mvp-c6-area-catalog]`) | Public `GET /v1/public/jurisdictions` index + effective-dated district directory (`…/jurisdictions/:id/districts?asOf=`) + official boundary geometry (`…/districts/:revisionId/geometry`, or `?include=geometry`). Official `geo.districts` revisions only — no user points, no `geo.regions` presets, no freeform district-id query |

**Intentional UX split:** geo and tier **count** filtering apply only on **`GET …/:id/counts`**. List and thread detail endpoints parse `scope`/`tier` but do not filter embedded tallies (`applied.geo` / `applied.tier` stay false there). Clients that need scoped numbers must call `/counts`.

**Separate from count filtering (target, Phase D alignment):** read DTOs carry a per-author **`authorGeo` relation** (`home`/`affected`/`jurisdiction`/`none`) resolved server-side per viewer — public reads accept an **optional session** for this; the relation enum is the only residence signal that ever leaves the API. See [REGION-MODEL.md](./REGION-MODEL.md) "Author-geo relations".

---

## Phase C — what is still open

Grouped by dependency. Tags are proposed agent-loop names.

### Near-term (closes the geo/KYC story for alpha)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c4-action-snapshots]`** | No per-action geo/tier snapshot at civic submit | Counts use **current** address + **current** tier only (`asOf = now`). Spec §9 expects geography and tier **at time of action** for audit-grade history. Snapshots are **relationship flags** (in-affected / in-jurisdiction + tier), never points; they are also the target source for the `authorGeo` relation (current residence is the documented interim). |
| **`[mvp-c4b-date-filters]`** | `from` / `to` on counts stubbed (`applied.date: false`) | Contributor spec §6.4 combinable date filters. |
| **`[mvp-c4c-my-district]`** | `scope=my-district` inert without auth | Needs authenticated counts (or viewer context) + `viewerDistrictId`. |
| **`[mvp-c5-region-presets]`** | `geo.regions` exists; no service/API to create platform presets | Internal “southern Alberta”, rep bundles, etc. Service speaks `region_id`; public API stays coarse `GeoScope`. |

### MVP foundation (multi-jurisdiction)

The **foundation** here is launch scope (see `[ROADMAP.md](./ROADMAP.md)` MVP and `[PRD.md](./PRD.md)` §3/§6): membership, root↔jurisdiction binding + `oursay-global` fallback, and the UI selector + unified-feed **components** (which work with a single active chain). A *populated* multi-chain feed is best-effort. (`[mvp-c11-ever-in-region]` below is a later filter mode, not foundation — V1.)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c10-multi-jurisdiction]`** | Single `CHAIN_ID` / one `RecordService` chain in API container | Writes and reads should follow each thread’s `audienceScope.jurisdiction`, not only deployment default. Worker already multi-chain. **Foundation = MVP; a populated multi-chain feed is best-effort.** |
| **`[mvp-c10b-membership]`** | No user ↔ jurisdiction subscription | Glossary: users may belong to multiple jurisdictions. **MVP foundation** — the membership API backs the UI jurisdiction-selector + “my jurisdictions” unified feed even with one active chain. |
| **`[mvp-c10c-profile-patch]`** | ~~no PATCH~~ → **shipped (retargeted):** handle / displayName / bio via `PATCH /v1/profile`; street modal retired; geocode from KYC/POA only | Was address-write + geocode; product path is identity prefs + seam intake. |
| **`[mvp-c11-ever-in-region]`** | `profile_geocode_history` unused | Optional filter mode (V1): “ever in region” using history ∪ action snapshots (REGION-MODEL). |

### Trust and formal outcomes (overlap Phase E)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c12-poll-results]`** | No derived `result` entity when a poll closes | Spec §8.4 formal outcome surface. |
| **`[mvp-c13-signed-count-snapshots]`** | R26 — no platform-signed count manifests | Filtered aggregates are recomputed on read; nothing signed to detect silent tampering. |
| **`[mvp-c14-count-amendments]`** | No auditable recount / invalidate-validate overlay | Formal corrections without silent SQL drift. |
| Full public-record sync/stream | Still deferred (PRD Phase E / US-SYS-8) | Interim: `/v1/explorer/:chainId` block/tx reads only — inefficient MVP, not bulk sync |
| **`[mvp-c-kyc-provider]`** | Equifax (etc.) not implemented; recovery re-verify incomplete | Real residency tier and provider-signed rows (R27). |

### App and ops (Phase D / E — not backend geo)

| Gap | Notes |
|-----|--------|
| Web app (`web-app/` workspace) | ✅ Bridge MVP landed — Next.js app wired to the live API; `/walk` remains the dev auth harness |
| CORS / BFF | ✅ Same-origin `/v1/*` proxy via Next `rewrites()` → `:6173`; mock path behind `NEXT_PUBLIC_MOCK_ONLY` |
| **Didit hosted KYC in the UI (gap A)** | Backend complete + sandbox-proven, but `web-app/src/lib/api/me.ts` never opens a Didit hosted session — Get-Verified only does dev-attest + platform residency. Under `KYC_PROVIDER=didit` the dev button 403s (gap B: didit declines direct `verify()`). Dev default stays dev-attest; UI walk uses `KYC_PROVIDER=stub`. ~1 web-app commit to close (needs a public provider flag). |
| Production deploy, external anchors | Phase E |
| Notifications | Spec §14 KYC result etc.; no routes |
| Peer sponsorship / waitlist | Deferred — paid-verify contingency only (contributor §5.6–5.7) |
| **Donation soft-ask (GitHub Sponsors)** | Soft-ask before Didit session (verify / recover / re-verify); profile Donate; optional banner. See [DONATION-FUNDED-VERIFY-HANDOFF.md](./temp/DONATION-FUNDED-VERIFY-HANDOFF.md). |
| **Funding contingency** | If donations collapse: invasive popups/banners → last-resort pay-per-verification. Not launch scope. |

---

## Suggested order (pre-UI)

```text
1. [mvp-c9-jurisdiction-config] + [mvp-c9b-count-gating]   ✅ LANDED
      oursay-global vs ab-ca-gov policy loaded from @oursay/jurisdiction-data; countGating is real.

2. [mvp-c6-area-catalog]   ✅ LANDED
      Public jurisdiction index + effective-dated district directory + official boundary geometry.

3. [mvp-c4-action-snapshots]
      Geo + tier at civic write for singleton actions.

4. [mvp-c4b-date-filters] + [mvp-c4c-my-district]
      Complete the count filter surface.

5. [mvp-c5-region-presets]
      Internal region CRUD on top of geo.regions.

6. [mvp-c10-multi-jurisdiction] + [mvp-c10b-membership]
      Before a unified cross-jurisdiction feed.

7. [mvp-c12-poll-results] → [mvp-c13-signed-count-snapshots] → [mvp-c14-count-amendments]
      Trust layer; can trail alpha if counts are honestly labelled “live recompute”.

Phase D (web app) after 2–4 (or agreed subset): browse/detail + `/counts` panel. Build the jurisdiction-selector + unified-feed **components** now — they work with a single active chain, and a hidden/one-option selector is far cheaper than retrofitting one later. A *populated* multi-chain feed waits on 6 (`[mvp-c10-multi-jurisdiction]` + `[mvp-c10b-membership]`).
```

---

## Constraints to keep (unchanged)

- **Region-first filtering** — count code uses `Region` + `participantInRegion`; never public “is user U in district D”.
- **Coarse public API** — fixed `GeoScope` enum on unauthenticated routes; custom regions are internal or authenticated.
- **No district on the user row** — geocode point + dynamic `contains`; optional snapshots at action time.
- **Private linkage** — persona/nullifier → user never on public responses.
- **Relations, never locations** — the one sanctioned per-author residence signal on DTOs is the viewer-relative `authorGeo` **relation enum** (`home`/`affected`/`jurisdiction`/`none`; `home` only for residency-verified viewers), computed server-side. Raw author districts/points are never serialized; action-geo snapshots store **relationship booleans**, not points.

---

## Future UI assumptions (not scheduled)

When the app lands:

1. **Feed rows** — `jurisdictionId`, `entityId`, `type`, `audienceScope` (+ `appliesToDistrictIds`, `signTier`, `editCount`, viewer-resolved `identity` and `authorGeo`) per item; jurisdiction filter from membership API.
2. **Scoped numbers** — always `GET …/:id/counts?scope=…&tier=…`; never list/detail embedded tallies for filtered views.
3. **Gating** — respect `countGating` and the per-action `gates` from jurisdiction config.
4. **Official view** — optional signed snapshot + amendment chain when C13/C14 exist.
5. **Viewer-optional reads** — public read endpoints accept an optional session for viewer-relative fields; the anonymous variant is the cacheable one. The full endpoint map for Phase D is in the web-app gaps doc, Part 4. <!-- see .agents/WEB-APP-GAPS.md -->

---

_Last updated: 2026-07-06 — Bridge MVP (Phases 1–6): web-app wired live through the `/v1/*` proxy, dev seed, Didit KYC provider (hosted-session UI deferred — gaps A/B), e2e smoke `api/test/35-e2e-smoke.spec.ts`._
