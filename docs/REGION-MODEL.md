# Region model — implementation anchor

How OurSay's geographic vocabulary ([GLOSSARY](GLOSSARY.md): **jurisdiction → district → region**)
maps to code and schema. The library is **`@oursay/geo`**; the contributor spec ([§6](01-CONTRIBUTOR-SPEC.md))
describes the same ideas in deployment-neutral "area" language. This file ties the model to the
`geo` schema, `contains` semantics, effective-dated resolution, and the public-API seam.

## Region kinds

A **Region** is the service-layer filter unit. Filter/count code calls `region.contains(point)` and
**never branches on raw district-id lists**, so one call site serves every kind:

| Kind | Built by | Geometry |
|---|---|---|
| `district` | `RegionResolver.forDistrict(id)` / `resolve(id)` | one district revision |
| `district_union` | `RegionResolver.fromDistrictUnion(ids)` | additive union of revisions |
| `jurisdiction` | `RegionResolver.forJurisdiction(jurisdictionId, asOf)` | one revision per riding, in force at `asOf` |
| `custom` | `RegionResolver.resolve(id)` (stored preset) | the preset's own stored geometry |

Every district is a region; not every region is a district. Built-in kinds are computed on the fly;
only **custom presets** are persisted (`geo.regions`). Containment is a single PostGIS query
(`ST_Contains` over the union of member geometries, or the custom geometry). All geometry is stored in
EPSG:4326; source boundaries are reprojected on ingest (`ST_Transform`).

## Boundaries are effective-dated, not year-keyed

`geo.districts` holds one row per boundary **revision**:

- **`id`** — stable revision identity, a year-anchored slug (`edmonton-strathcona-2019`, with a
  `-{n}` suffix when a second set lands the same calendar year, `…-2019-2`).
- **`effective_date`** (required) — the first day this geometry is in force. **This is the lookup key.**
- **`drawn_date`** (optional) — when the map was drawn/enacted, if known (e.g. Alberta Bill-33, 2017‑12‑15).
- **`boundary_year`** — slug/display only, derived from `effective_date`.
- **`riding_slug`** — year-less logical-riding key, so revisions of the same seat group across redraws.

**`asOf` resolution.** `forJurisdiction(jurisdictionId, asOf)` selects districts with
`effective_date <= asOf`, then **one revision per `riding_slug`** by the tie-break **latest
`effective_date`** (`DISTINCT ON (riding_slug) … ORDER BY effective_date DESC`). So a redraw is just a
new revision with a later `effective_date`; queries before/after it resolve to the older/newer geometry
automatically. Reproducibility = address + action timestamp + effective-dated boundaries (not a frozen
assignment row, not the year label).

## Public-API seam (stub — not wired this phase)

`api`'s `GeoScope` (`jurisdiction | impacted-region | my-district | all-public`) is parsed and echoed
on `/v1/public/…` but **not resolved** (`filters.applied: false`). `RegionResolver.compileScope` is the
seam a later phase will call:

| `GeoScope` | compiles to |
|---|---|
| `jurisdiction` | `forJurisdiction(jurisdictionId, asOf)` |
| `impacted-region` | `fromDistrictUnion(appliesToDistrictIds)`; empty ⇒ whole jurisdiction at `asOf` |
| `my-district` | the **authenticated** viewer's district, or `null` (inert — no viewer identity on public routes) |
| `all-public` | `null` (no geo filter) |

`compileScope` already accepts an optional **`asOf`** (entity creation time, poll open, …) even though
no route passes one yet. **Which instant binds is future jurisdictional config:** a deployment will
choose creation-time vs resolution-time vs an advertised count-snapshot instant for public consumption;
the platform may filter at either point, and a snapshot is **advertisement only** (the signed record is
unchanged). `EntityRules.appliesToDistrictIds` ([governance](../public-record/src/governance.ts))
compiles to an implicit `district_union` (impacted-region scope).

Privacy ([06 §2–3](06-PRIVACY-REVIEW.md)): public geography stays **coarse**. Fine granularity (custom
geometry, voting-area dissolve) is allowed **internally** but must not be exposed as arbitrary geometry
or freeform district-id lists on unauthenticated routes.

## Participant geocode (private input to `contains`)

A participant's address is geocoded into a **private point** — the future input to `region.contains`.
This is structural **resolvability**, not residency/KYC, and stores no district/region id. Two `auth`
tables hold it (PRIVATE PII; never on any HTTP response; see [`api/README.md` § Geocoding](../api/README.md)):

- `auth.profile_geocodes` — the participant's **current** point (one row per user).
- `auth.profile_geocode_history` — **append-only** log of every distinct address→point they've resolved to.

A later phase (C7) will choose, per jurisdiction config, **which point** a scoped filter binds to:

| Filter mode | Point source | Question it answers |
|---|---|---|
| `current` | `auth.profile_geocodes` | Where is the participant **now**? |
| `at_action` | a per-action snapshot frozen at civic-write time (**C4**) | Where were they **when they acted**? |
| `ever_in_region` | `auth.profile_geocode_history` ∪ action snapshots | Have they **ever** been in region? |

**This phase (C2) ships only the `current` cache + history append** — no mode selection and no
point-in-polygon filtering (that is C7), and no action-time snapshot (that is C4). For any *scoped* mode,
**no usable point ⇒ out-of-area** for `jurisdiction` / `impacted-region` / `my-district`; `all-public`
still includes such participants. Geocoding is best-effort: a participant without a resolvable address
simply has no point.

## Where it lives

- Schema: `geo/src/schema/geo.sql.ts` (`geo.districts`, `geo.regions`).
- Store / containment: `geo/src/store.ts` (`GeoStore`).
- Region + resolver: `geo/src/region.ts`, `geo/src/region-resolver.ts`.
- Pluggable ingest: `geo/src/ingest/source.ts` (`BoundarySource`, `ShapefileSource`), CLI
  `geo/scripts/ingest.ts`. Package guide: [`geo/README.md`](../geo/README.md).
