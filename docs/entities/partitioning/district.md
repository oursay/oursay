# District

## Definition

The electoral subdivision within a jurisdiction (riding, ward, constituency). District membership is **inferred from the user's address at query time** — never stored on the user row. Boundaries are **effective-dated revisions**, not frozen assignments.

## Aliases

| Layer | Name |
|-------|------|
| Product | District / riding / ward |
| Code | `DistrictCatalogRow`, `geo.districts` |
| Region kind | `district` (single-district region) |

See [GLOSSARY.md](../../GLOSSARY.md) and [REGION-MODEL.md](../../REGION-MODEL.md).

## Identity

Two district revisions are the same if their `id` matches. Primary key: `id` (e.g. `edmonton-strathcona-2019`). The year in the slug is a **label**; lookup uses `effective_date`, not the year alone. The **`district_slug`** (year-less) is the stable key across revisions: stable district pages and `appliesToRegion: district:<district_slug>` key off it, while revision slugs (`id`) address a specific boundary version for history.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | TEXT | yes | yes | Revision slug |
| `jurisdiction_id` | TEXT | yes | yes | Parent jurisdiction |
| `name` | TEXT | yes | yes | Human-readable name |
| `district_slug` | TEXT | yes | yes | Year-less logical seat key |
| `effective_date` | DATE | yes | yes | First day geometry is in force |
| `drawn_date` | DATE | no | yes | When map was enacted |
| `boundary_year` | INT | yes | yes | Display only; derived from effective_date |
| `source` | TEXT | yes | yes | Data provenance |
| `source_ref` | TEXT | no | yes | Source reference |
| `geom` | MultiPolygon 4326 | yes | yes* | Official boundary geometry |

\* Public via area catalog geometry endpoint; never participant points.

## States & lifecycle

Boundary revisions are **append-only**. A redraw adds a new row with a later `effective_date`. Resolution at instant `asOf`: select rows with `effective_date <= asOf`, then **one revision per `riding_slug`** (latest `effective_date` wins).

```
[boundary revision A, effective 2019-04-01]
        │
        ▼ (redraw)
[boundary revision B, effective 2023-04-01]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Jurisdiction | N:1 | `jurisdiction_id` FK |
| Region | 1:1 kind | Every district is a `district` region |
| User | inferred | Via geocode point + `region.contains(point)` |
| EntityRules | referenced | `appliesToRegion` on polls/petitions (today `appliesToDistrictIds`) |

## Invariants

- District is **never persisted on the user** ([GLOSSARY](../../GLOSSARY.md)).
- Reproducibility = address + action timestamp + effective-dated boundaries ([REGION-MODEL.md](../../REGION-MODEL.md)).
- Public catalog exposes official electoral boundaries only — not participant points ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md)).

## Permissions

- **Read:** Public via `GET /v1/public/jurisdictions/:id/districts?asOf=` and geometry endpoint.
- **Write:** Platform ingest only (shapefile pipeline in `@oursay/geo`).

## Events

- Boundary ingest from Elections Alberta shapefiles (2019 + 2023 revisions landed).

## Examples

**Valid:** `{ id: "edmonton-strathcona-2019", jurisdiction_id: "ab-ca-gov", riding_slug: "edmonton-strathcona", effective_date: "2019-04-01" }`

**Invalid:** Storing `district_id` on `auth.profiles` or `public.users` — membership is always inferred.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `geo/src/schema/geo.sql.ts` → `geo.districts` |
| Store | `geo/src/store.ts` |
| Resolver | `geo/src/region-resolver.ts` → `forDistrict()`, `forJurisdiction()` |
| Catalog API | `api/src/http/routes/public-area-catalog.routes.ts` |

## Gaps

- None for MVP boundary catalog. Action-time district snapshots not built ([mvp-c4-action-snapshots]).
- **Platform-signed boundary revisions** (a district redraw as a platform-signed record) are future — see [partitioning/future.md](./future.md).
