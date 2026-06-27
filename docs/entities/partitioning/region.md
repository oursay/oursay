# Region

## Definition

The generic, app-wide term for **any filterable geographic shape**. A region resolves to an additive set of district geometries (or its own stored geometry) and answers `region.contains(point)`. Every district is a region; not every region is a district.

## Aliases

| Layer | Name |
|-------|------|
| Product | Region / area / filter scope |
| Code | `Region`, `RegionKind`, `GeoScope` |
| API filter | `scope` query param on counts endpoints |

See [GLOSSARY.md](../../GLOSSARY.md) and [REGION-MODEL.md](../../REGION-MODEL.md).

## Identity

Two regions are the same if their `id` matches within a jurisdiction context. Built-in regions are computed on the fly; custom presets use `geo.regions.id` as primary key.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | string | yes | partial | Slug or preset id |
| `kind` | `RegionKind` | yes | no | How geometry is composed |
| `jurisdictionId` | string | yes | yes | Parent jurisdiction |
| `districtIds` | string[] | varies | no | Member revision ids (empty for pure custom) |
| `hasOwnGeom` | boolean | yes | no | True for stored custom presets |
| `name` | string | presets only | internal | Human label for custom presets |

### RegionKind

| Kind | Built by | Geometry source |
|------|----------|-----------------|
| `district` | `forDistrict(id)` | One district revision |
| `district_union` | `fromDistrictUnion(ids)` | Additive union of revisions |
| `jurisdiction` | `forJurisdiction(id, asOf)` | One revision per riding at `asOf` |
| `custom` | `resolve(presetId)` | Stored `geo.regions.geom` |

### GeoScope (public API seam)

| Scope | Compiles to |
|-------|-------------|
| `jurisdiction` | Whole jurisdiction at `asOf` |
| `impacted-region` | Entity's `appliesToRegion` (today `appliesToDistrictIds` union); empty ⇒ whole jurisdiction |
| `my-district` | Viewer's inferred district (requires auth) |
| `all-public` | No geo filter |

## States & lifecycle

Value object — no persistent state for built-in kinds. Custom presets are created once and referenced by id.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| District | N:M | Union of district revisions |
| Jurisdiction | N:1 | Scoped to one jurisdiction |
| EntityRules | derived | `appliesToRegion` → `impacted-region` scope (today `appliesToDistrictIds`) |
| ProfileGeocode | input | Private point tested via `contains()` |

## Invariants

- Filter code calls `region.contains(point)` — **never branches on raw district-id lists** ([REGION-MODEL.md](../../REGION-MODEL.md)).
- Public routes use coarse `GeoScope` enum only — no freeform district-id query surface ([06-PRIVACY-REVIEW.md](../../06-PRIVACY-REVIEW.md)).
- Geo/tier filtering applies on **`GET …/:id/counts` only**; list/detail tallies are unfiltered by design.
- A thread declares its geographic stake via **`appliesToRegion`** (a RegionRef/union), never a raw district-id array on the public surface.
- The term **Region** is retained. A region is, in theory, multi-jurisdiction-capable, but discussions are always jurisdiction-scoped; the cross-jurisdiction path is future — see [partitioning/future.md](./future.md).

## Permissions

- **Read (built-in):** Implicit via count endpoints with `scope` param.
- **Read (custom presets):** Internal only today — no public HTTP CRUD.
- **Write:** Platform admin for custom presets (not shipped).

## Events

- Count request: `compileScope()` → `Region` → filter participants via `ParticipantGeoService`.

## Examples

**Valid:** `RegionKind = "district_union"` with `districtIds: ["edmonton-strathcona-2019", "edmonton-gold-bar-2019"]` for a rep bundle filter.

**Invalid:** Exposing `geo.regions` custom presets or participant geocode points on unauthenticated routes.

## Implementation

| Layer | Path |
|-------|------|
| Value object | `geo/src/region.ts` |
| Resolver | `geo/src/region-resolver.ts` |
| Custom storage | `geo.regions` |
| Count integration | `api/src/services/public-record-read.service.ts` |
| Participant linkage | `api/src/services/participant-geo.service.ts` |

## Gaps

- **[mvp-c5-region-presets]**: `geo.regions` exists; no service/API to create platform presets.
- **[mvp-c4c-my-district]**: `scope=my-district` inert without authenticated counts context.
- **[mvp-c11-ever-in-region]**: History-based filter mode not built.
