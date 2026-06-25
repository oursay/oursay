# API gaps and pre-UI roadmap

What `@oursay/api` and the civic read/write surface **do today**, what is **stubbed or missing**, and
suggested **backend work before Phase D (web app)**. UI planning stays deferred until these seams are
stable — especially jurisdiction policy, membership, and how official counts are advertised.

**See also:** [`api/README.md`](../api/README.md) (operational detail) · [`REGION-MODEL.md`](./REGION-MODEL.md)
(region-first filtering) · [`GLOSSARY.md`](./GLOSSARY.md) · [`01-CONTRIBUTOR-SPEC.md`](./01-CONTRIBUTOR-SPEC.md) §6–7

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
| Browse/detail tallies | **Unfiltered** totals only (by design — see below) |

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

**Intentional UX split:** geo and tier filtering apply only on **`GET …/:id/counts`**. List and thread
detail endpoints parse `scope`/`tier` but do not filter embedded tallies (`applied.geo` / `applied.tier`
stay false there). Clients that need scoped numbers must call `/counts`.

---

## Phase C — what is still open

Grouped by dependency. Tags are proposed agent-loop names.

### Near-term (closes the geo/KYC story for alpha)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c4-action-snapshots]`** | No per-action geo/tier snapshot at civic submit | Counts use **current** address + **current** tier only (`asOf = now`). Spec §9 expects geography and tier **at time of action** for audit-grade history. |
| **`[mvp-c4b-date-filters]`** | `from` / `to` on counts stubbed (`applied.date: false`) | Contributor spec §6.4 combinable date filters. |
| **`[mvp-c4c-my-district]`** | `scope=my-district` inert without auth | Needs authenticated counts (or viewer context) + `viewerDistrictId`. |
| **`[mvp-c5-region-presets]`** | `geo.regions` exists; no service/API to create platform presets | Internal “southern Alberta”, rep bundles, etc. Service speaks `region_id`; public API stays coarse `GeoScope`. |
| **`[mvp-c6-area-catalog]`** | No public district directory | Spec §7.2 — district ids + names (+ boundary metadata), **no geometry** on unauthenticated routes. |

### Medium-term (multi-jurisdiction product)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c10-multi-jurisdiction]`** | Single `CHAIN_ID` / one `RecordService` chain in API container | Writes and reads should follow each thread’s `audienceScope.jurisdiction`, not only deployment default. Worker already multi-chain. |
| **`[mvp-c10b-membership]`** | No user ↔ jurisdiction subscription | Glossary: users may belong to multiple jurisdictions. Needed for unified feed + “my jurisdictions” without inferring from one default. |
| **`[mvp-c10c-profile-patch]`** | `GeocodeService.syncGeocodeForUser` exists; no `PATCH /v1/profile` | Address changes must refresh geocode cache. |
| **`[mvp-c11-ever-in-region]`** | `profile_geocode_history` unused | Optional filter mode: “ever in region” using history ∪ action snapshots (REGION-MODEL). |

### Trust and formal outcomes (overlap Phase E)

| Tag | Gap | Why it matters |
|-----|-----|----------------|
| **`[mvp-c12-poll-results]`** | No derived `result` entity when a poll closes | Spec §8.4 formal outcome surface. |
| **`[mvp-c13-signed-count-snapshots]`** | R26 — no platform-signed count manifests | Filtered aggregates are recomputed on read; nothing signed to detect silent tampering. |
| **`[mvp-c14-count-amendments]`** | No auditable recount / invalidate-validate overlay | Formal corrections without silent SQL drift. |
| **`[mvp-c-kyc-provider]`** | Equifax (etc.) not implemented; recovery re-verify incomplete | Real residency tier and provider-signed rows (R27). |

### App and ops (Phase D / E — not backend geo)

| Gap | Notes |
|-----|--------|
| Web app (`app/` workspace) | No product UI; `/walk` is dev-only |
| CORS / BFF | API has no CORS; browser app needs same-origin proxy or BFF |
| Production deploy, external anchors | Phase E |
| Notifications, sponsorship, waitlist | Spec §14; no routes |

---

## Suggested order (pre-UI)

```text
1. [mvp-c9-jurisdiction-config] + [mvp-c9b-count-gating]   ✅ LANDED
      oursay-global vs ab-ca-gov policy loaded from @oursay/jurisdiction-data; countGating is real.

2. [mvp-c6-area-catalog]
      Public district list for clients (no shapes).

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

Phase D (web app) after 2–4 (or agreed subset): browse/detail + `/counts` panel, no feed UX until 6 if multi-jurisdiction matters.
```

---

## Constraints to keep (unchanged)

- **Region-first filtering** — count code uses `Region` + `participantInRegion`; never public “is user U in district D”.
- **Coarse public API** — fixed `GeoScope` enum on unauthenticated routes; custom regions are internal or authenticated.
- **No district on the user row** — geocode point + dynamic `contains`; optional snapshots at action time.
- **Private linkage** — persona/nullifier → user never on public responses.

---

## Future UI assumptions (not scheduled)

When the app lands:

1. **Feed rows** — `jurisdictionId`, `entityId`, `type`, `audienceScope` per item; jurisdiction filter from membership API.
2. **Scoped numbers** — always `GET …/:id/counts?scope=…&tier=…`; never list/detail embedded tallies for filtered views.
3. **Gating** — respect `countGating` from jurisdiction config.
4. **Official view** — optional signed snapshot + amendment chain when C13/C14 exist.

---

_Last updated: 2026-06-24 — Phase C geo/tier on `/counts` + per-jurisdiction count-exposure gating (c9/c9b) on branch `geo-foundation`._
