# ProfileGeocode

## Definition

Private geocoded point derived from a user's profile address. The current cache row powers **district inference** via `region.contains(point)`. History rows support future "ever in region" filters. Never exposed on HTTP.

## Aliases

| Layer | Name |
|-------|------|
| Product | Address geocode / participant location |
| Code | `ProfileGeocode`, `auth.profile_geocodes` |
| History | `auth.profile_geocode_history` |

See [REGION-MODEL.md](../../REGION-MODEL.md) §Participant geocode.

## Identity

**Current:** one row per user — primary key `auth.profile_geocodes.user_id`.

**History:** composite key `(user_id, address_hash)` — append-only log of distinct address→point resolutions.

## Attributes

### Current cache (`profile_geocodes`)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `user_id` | UUID | yes | **never** | PK → `users.id` |
| `address_hash` | TEXT | yes | no | Invalidation key when address changes |
| `geom` | Point 4326 | yes | **never** | PostGIS geometry |
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
| `cleared` | Address removed / invalidated |
| `unchanged` | Address hash matches existing |
| `skipped` | Geocode not attempted |

## States & lifecycle

```
[registration / address change]
        │ GeocodeService
        ▼
[geocoded | unresolved]
        │ address hash change
        ▼
[history append + cache upsert]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User / Profile | 1:1 current | Via `user_id` |
| District | inferred | `ParticipantGeoService`: point → district at `asOf` |
| Region filters | input | `contains(point)` on count endpoints |

### Filter modes (jurisdiction config — future)

| Mode | Point source | Status |
|------|--------------|--------|
| `current` | `profile_geocodes` | **Live** on `/counts` |
| `at_action` | Per-action snapshot at civic write | **[Gap]** `[mvp-c4-action-snapshots]` |
| `ever_in_region` | History ∪ action snapshots | **[Gap]** `[mvp-c11-ever-in-region]` |

## Invariants

- Participant geocode point is **private PII** — never on HTTP responses ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md)).
- District membership is inferred, never stored ([GLOSSARY.md](../../GLOSSARY.md)).
- No usable point ⇒ participant is out-of-area for scoped geo filters.
- Counts today use **current** address + **current** tier only (`asOf = now`).

## Permissions

| Action | Who |
|--------|-----|
| Write | `GeocodeService` on registration / address sync |
| Read | Internal services only (`ParticipantGeoService`) |

## Events

- Registration: best-effort geocode after profile create.
- Address change (future PATCH): `syncGeocodeForUser()`.

## Examples

**Valid:** Edmonton address geocoded → point inside `edmonton-strathcona-2019` at query `asOf` → counts with `scope=impacted-region` include this participant.

**Invalid:** Returning `geom` coordinates in API response or storing district id on geocode row.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/geocode.repo.ts` |
| Service | `api/src/services/geocode.service.ts` |
| Participant linkage | `api/src/services/participant-geo.service.ts` |
| Config | `api/src/config.ts` → `GeocodeProviderName` |

## Gaps

- **[mvp-c4-action-snapshots]**: No geo/tier snapshot at civic submit time.
- **[mvp-c10c-profile-patch]**: No profile PATCH to trigger re-geocode from user flow.
- **[mvp-c11-ever-in-region]**: History table unused for filtering.
