# ProfileGeocode

## Definition

Private geocoded **point** used for district inference via `region.contains(point)`. Sourced from the **address / coordinates returned by residency / POA verification** (Didit or stub/dev path) — resolve once, **store the point**, do **not** persist the street-address string on the profile. History rows support future "ever in region" filters. Never exposed on HTTP.

## Aliases

| Layer | Name |
|-------|------|
| Product | Address geocode / participant location |
| Code | `ProfileGeocode`, `auth.profile_geocodes` |
| History | `auth.profile_geocode_history` |

See [REGION-MODEL.md](../../REGION-MODEL.md) §Participant geocode and [account/future.md](./future.md) (*KYC-held identity PII*).

## Identity

**Current:** one row per user — primary key `auth.profile_geocodes.user_id`.

**History:** composite key `(user_id, address_hash)` — append-only log of distinct location→point resolutions. The DB column is still named `address_hash`; in code comments it is the **location hash** (`location_hash` rename deferred). It is for **invalidation only** (detect “same resolved location again”); it is not a recoverable street address.

## Attributes

### Current cache (`profile_geocodes`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `user_id` | UUID | yes | **never** | PK → `users.id` |
| `address_hash` | TEXT | yes | no | Non-reversible invalidation key (rounded-coord hash when a point exists; else normalized-address hash) |
| `geom` | Point 4326 | yes | **never** | PostGIS geometry — **3 decimal places (~100 m)** when stored from a resolved point |
| `provider` | TEXT | yes | no | `'didit'` \| `'stub'` \| `'geocodio'` |
| `confidence` | REAL | no | no | Provider confidence score |
| `geocoded_at` | TIMESTAMPTZ | yes | no | |

### History (`profile_geocode_history`)

Same fields plus `recorded_at` — append-only; one row per distinct `(user_id, address_hash)`.

### GeocodeStatus (service outcomes)

| Status | Meaning |
|--------|---------|
| `geocoded` | Point resolved and stored |
| `unresolved` | Provider could not resolve |
| `cleared` | Point removed / invalidated (below geocodeable-address gate) |
| `unchanged` | Location hash matches existing row — no provider call / upsert |
| `skipped` | Geocode not attempted |

## Hashing & rounding

When a **point is present** (Didit `document_location` **or** a geocode-seam hit):

1. Round lon/lat to **3 decimal places** (~100 m).
2. Store that rounded point in `geom`.
3. Set `address_hash` to a hash of those rounded coordinates (not the street text).

When **no point** can be obtained (no coords and provider returns null / below address gate): hash the **raw normalized address** so “same unresolved address again” stays idempotent without writing a point.

**Upsert only on hash change.** If the computed location hash matches the current cache row → `unchanged`.

## Country / provider policy

- **`GeocodeService` is country-agnostic** — it does not refuse or clear by country. Clears only when the intake falls below `hasGeocodableAddress`.
- **Canada-only** stays on the **dev stub** (`StubGeocodeProvider`). Jurisdiction / country limits belong on the KYC workflow / provider side later.
- Different seam providers may be routed by country later (e.g. Geocodio for CA/US).

## States & lifecycle

```
[residency / POA Approved — KYC seam returns coords and/or address]
        │ ephemeral intake (do not write street address to profile)
        ▼
[prefer Didit document_location → else geocode seam from structured address]
        │ location_hash change
        ▼
[history append + cache upsert — store rounded geom only]
```

**Primary trigger:** Didit POA Approved (poll + webhook) — ephemeral `poa_parsed_address` / `document_location`; never written onto `auth.profiles`. Registration / `PATCH /v1/profile` may still geocode from stored profile address; that is drift to remove later.

**POA path:** On every Approved POA, attempt residency → point best-effort. Tier award remains once via `claimAttestation` and must not fail if geocode fails. Provider labels: Didit coords → `didit`; address fallback → `stub` / `geocodio`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | 1:1 current | Via `user_id` |
| Verification | causal | Residency attestation supplies the ephemeral address / coords used to build the point |
| District | inferred | `ParticipantGeoService`: point → district at `asOf` |
| Region filters | input | `contains(point)` on count endpoints |

### Filter modes (jurisdiction config — future)

| Mode | Point source | Status |
|------|--------------|--------|
| `current` | `profile_geocodes` | **Live** on `/counts` |
| `at_action` | Per-action snapshot at civic write | **[Gap]** `[mvp-c4-action-snapshots]` |
| `ever_in_region` | History ∪ action snapshots | **[Gap]** `[mvp-c11-ever-in-region]` |

## Invariants

- Participant geocode point is **private location data** — never on HTTP responses ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md)). The only derived residence signal on any DTO is the viewer-relative `authorGeo` **relation enum** ([REGION-MODEL.md](../../REGION-MODEL.md) "Author-geo relations").
- District membership is inferred, never stored ([GLOSSARY.md](../../GLOSSARY.md)).
- No usable point ⇒ participant is out-of-area for scoped geo filters.
- Counts today use **current** point + **current** tier only (`asOf = now`).
- Street address / legal name are **not** stored alongside the point (KYC seam retains them).
- Multi-candidate rounding / district membership is **not** evaluated at POA-approve time (see future boundary reverify).

## Future: boundary change / rounding candidates (not built)

When district boundaries change, stored points sit on a **3-dp (~100 m) grid**. A future job may:

- Build a **2×2 matrix** of round-down / round-up candidates for lat/lon around the stored point (same order until a cell matches the exact point’s region); if that fails, optionally retry at 4–5 decimal places.
- Flag users within that tolerance of a **specifically changed** boundary segment that **reverification is recommended**; optionally revoke residency KYC when detection is accurate enough.
- **Shrink / move inward:** only users who could fall **outside** the new geometry (near the moved edge).
- **Grow / expand:** existing in-district points stay valid; do not mass-flag the grown interior. Impact the **shrunken** neighbor if that is where the edge moved.
- Rectangular example: three sides unchanged, one side shrinks → only people near that moved side who might now be outside get flagged.

See [account/future.md](./future.md) and [REGION-MODEL.md](../../REGION-MODEL.md).

## Encryption vs spatial index (preliminary)

**Need:** `ST_Contains` / GiST (and our `region.contains(point)` path) over participant points at count scale.

| Approach | Indexable / `ST_Contains`? | Notes |
|----------|----------------------------|--------|
| Plaintext `geometry(Point,4326)` + GiST | Yes | Current design; DB process sees coordinates when querying |
| Column encrypt (`pgcrypto` / AES → `bytea`) | **No** (practical) | Ciphertext is opaque; spatial predicates need plaintext coordinates. Decrypt-per-row in SQL forces seq scans and defeats GiST |
| Encrypt in app; containment in app (Shapely etc.) | N/A in PostGIS | Abandons DB spatial index for counts — poor fit for aggregate geo filters |
| Volume / disk / cloud “encryption at rest” | Yes | Protects offline media; **not** column confidentiality from a live DB superuser |
| Homomorphic / encrypted spatial indexes | Not available | No PostGIS-grade option for our stack today |

**Working assumption (document uncertainty):** We **cannot** column-encrypt `geom` and keep GIS indexing. Store queryable points; rely on **disk/volume encryption**, least-privilege DB roles, and never returning coordinates on HTTP. Optional future mitigations (coordinate quantization, coarser cells) are product/privacy trade-offs, not substitutes for encryption. Revisit if a proven encrypted-spatial path appears; until then treat “encrypt the pointcode” as **unlikely / incompatible** with the count architecture.

## Permissions

| Action | Who |
|--------|-----|
| Write | `GeocodeService` after residency address / coord intake |
| Read | Internal services only (`ParticipantGeoService`) |

## Events

- Residency/POA Approved: ephemeral Didit coords or structured address → resolve → upsert rounded point (or address-hash idempotency when unresolved).
- Stub/dev: `POST /v1/kyc/residency/attest` may still assume a prior point from profile geocode.

## Examples

**Valid:** Didit POA returns an Edmonton address (and optional `document_location`) → point inside `edmonton-strathcona-2019` at query `asOf` → counts with `scope=impacted-region` include this participant; profile has no street address columns filled from KYC.

**Invalid:** Returning `geom` coordinates in an API response; storing district id on the geocode row; persisting the street address string on `auth.profiles` “for convenience.”

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/geocode.repo.ts` |
| Service | `api/src/services/geocode.service.ts` |
| Participant linkage | `api/src/services/participant-geo.service.ts` |
| KYC intake | `api/src/services/kyc/didit-client.ts`, `kyc-session.service.ts` |
| Config | `api/src/config.ts` → `GeocodeProviderName` |

## Gaps

- **[mvp-c4-action-snapshots]**: No geo/tier snapshot at civic submit time.
- **[mvp-c11-ever-in-region]**: History table unused for filtering.
- **Boundary-change detection / reverify flags / KYC revoke** — docs intent only (see above).
- **Full `address_hash` → `location_hash` schema rename** — deferred.
- **Point encryption** — open uncertainty documented above; no implementation milestone until a GIS-compatible approach exists.
- Registration / profile PATCH may still geocode from stored address columns — drift to remove when PII columns drop.

### Tier without point (POA Approved, no usable geom) — product / filter gap

**Fact today:** Didit can award `residency_verified` when POA is Approved even if `document_location` is missing and the structured address does not resolve (`applyResidencyLocation` is best-effort; award must not fail). Attestation may still store a coarse `region` string (e.g. `"AB"`). That string is **never** used for geo filters, gates, or `authorGeo`.

**Filter / gate impact (no `auth.profile_geocodes` row):**

| Surface | Result |
|---------|--------|
| Counts `scope=jurisdiction` / `impacted-region` | **Excluded** (`participantInRegion` → false; no rough point is invented) |
| Counts `scope=all-public` (+ optional tier filter) | **Included** (tier-only) |
| `residencyIn` act gate / official floors | **Fails** (tier alone is insufficient; needs `viewerDistrictId`) |
| `authorGeo` | **`none`** (collapses with “no contextual tie”) |

There is **no** fallback rough geom from “Edmonton AB” / provincial coarse region. Jurisdiction-wide filters still require `region.contains(point)`.

**UX gap:** Residency pill (tier 2) still shows a plain `MapPin` for `authorGeo: "none"`, so a verified-but-unlocalized user looks the same as a resident outside the thread context. There is no `MapPinX` (or equivalent) for “residency verified, location unresolved.” Desired signal: distinguish this scenario in the UI (e.g. `MapPinX` when tier ≥ residency and no usable point), optionally with copy that re-verify / complete address resolution is needed — without inventing a fake jurisdiction membership.

**Open product questions (not decided):**

1. Should POA approval **withhold** `residency_verified` until a point resolves?
2. Should coarse region ever count for **jurisdiction-wide** membership (still never for district / `home`)?
3. Ship `MapPinX` (or a dedicated `authorGeo` / status value) before changing filter math?
