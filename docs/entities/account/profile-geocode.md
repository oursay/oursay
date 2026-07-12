# ProfileGeocode

## Definition

Private geocoded **point** used for district inference via `region.contains(point)`. Sourced from the **address returned by residency / POA verification** (Didit or stub/dev path) — geocode once, **store the point**, do **not** persist the street-address string on the profile. History rows support future "ever in region" filters. Never exposed on HTTP.

## Aliases

| Layer | Name |
|-------|------|
| Product | Address geocode / participant location |
| Code | `ProfileGeocode`, `auth.profile_geocodes` |
| History | `auth.profile_geocode_history` |

See [REGION-MODEL.md](../../REGION-MODEL.md) §Participant geocode and [account/future.md](./future.md) (*KYC-held identity PII*).

## Identity

**Current:** one row per user — primary key `auth.profile_geocodes.user_id`.

**History:** composite key `(user_id, address_hash)` — append-only log of distinct address→point resolutions. `address_hash` is for **invalidation only** (detect “same address again”); it is not a recoverable street address.

## Attributes

### Current cache (`profile_geocodes`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `user_id` | UUID | yes | **never** | PK → `users.id` |
| `address_hash` | TEXT | yes | no | Non-reversible invalidation key from ephemeral address |
| `geom` | Point 4326 | yes | **never** | PostGIS geometry (queryable; see encryption note) |
| `provider` | TEXT | yes | no | `'stub'` \| `'geocodio'` |
| `confidence` | REAL | no | no | Provider confidence score |
| `geocoded_at` | TIMESTAMPTZ | yes | no | |

### History (`profile_geocode_history`)

Same fields plus `recorded_at` — append-only; one row per distinct `(user_id, address_hash)`.

### GeocodeStatus (service outcomes)

| Status | Meaning |
|--------|---------|
| `geocoded` | Point resolved and stored |
| `unresolved` | Provider could not resolve |
| `cleared` | Point removed / invalidated |
| `unchanged` | Address hash matches existing |
| `skipped` | Geocode not attempted |

## States & lifecycle

```
[residency / POA Approved — KYC seam returns address]
        │ ephemeral geocode (do not write street address to profile)
        ▼
[geocoded | unresolved]
        │ address_hash change
        ▼
[history append + cache upsert — store geom only]
```

**Target trigger:** Didit POA (or stub residency) success — not registration profile fields. Code today may still geocode from a stored profile address; that is drift to remove.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | 1:1 current | Via `user_id` |
| Verification | causal | Residency attestation supplies the address used to build the point |
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
| Write | `GeocodeService` after residency address intake |
| Read | Internal services only (`ParticipantGeoService`) |

## Events

- Residency/POA Approved: ephemeral address → geocode → upsert point.
- Stub/dev: existing residency attest path may still assume a prior point; align to KYC-supplied address when wiring Didit POA → geocode.

## Examples

**Valid:** Didit POA returns an Edmonton address → geocode → point inside `edmonton-strathcona-2019` at query `asOf` → counts with `scope=impacted-region` include this participant; profile has no street address columns filled.

**Invalid:** Returning `geom` coordinates in an API response; storing district id on the geocode row; persisting the street address string on `auth.profiles` “for convenience.”

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/geocode.repo.ts` |
| Service | `api/src/services/geocode.service.ts` |
| Participant linkage | `api/src/services/participant-geo.service.ts` |
| Config | `api/src/config.ts` → `GeocodeProviderName` |

## Gaps

- **Didit POA → geocode wire-up** — receive address from residency decision, geocode, store point; do not write address onto profile.
- **[mvp-c4-action-snapshots]**: No geo/tier snapshot at civic submit time.
- **[mvp-c11-ever-in-region]**: History table unused for filtering.
- **Point encryption** — open uncertainty documented above; no implementation milestone until a GIS-compatible approach exists.
