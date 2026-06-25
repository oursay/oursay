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

## Public-API seam (LIVE on `…/:id/counts`)

`api`'s `GeoScope` (`jurisdiction | impacted-region | my-district | all-public`) is **resolved** on the
public count endpoints (`/v1/public/{posts,petitions,polls}/:id/counts`) via
`RegionResolver.compileScope`; the filter echo reports `applied.geo`. The KYC **`tier`** set is resolved
on the same surface (set membership over each participant's current attestation tier — `applied.tier`);
when both narrow they combine as **AND**, and the k-anonymity floor engages when **either** narrows.
(Browse lists + thread detail still echo only — geo/tier filtering is intentionally scoped to the count
endpoints.)

| `GeoScope` | compiles to |
|---|---|
| `jurisdiction` | `forJurisdiction(jurisdictionId, asOf)` |
| `impacted-region` | `fromDistrictUnion(appliesToDistrictIds)`; empty ⇒ whole jurisdiction at `asOf` |
| `my-district` | the **authenticated** viewer's district, or `null` (inert — no viewer identity on public routes) |
| `all-public` | `null` (no geo filter) |

The count path passes **`asOf = now`** (current-point mode pairs with the current boundary set);
`impacted-region` uses the entity's explicit `appliesToDistrictIds`, so its result is asOf-independent.
`compileScope` accepts an optional **`asOf`** (entity creation time, poll open, …) for later modes.
**Which instant binds is future jurisdictional config:** a deployment will
choose creation-time vs resolution-time vs an advertised count-snapshot instant for public consumption;
the platform may filter at either point, and a snapshot is **advertisement only** (the signed record is
unchanged). `EntityRules.appliesToDistrictIds` ([governance](../public-record/src/governance.ts))
compiles to an implicit `district_union` (impacted-region scope).

Privacy ([06 §2–3](06-PRIVACY-REVIEW.md)): public geography stays **coarse**. The protected risk is
**user points and fine-grained slicing**, not official electoral boundaries. Concretely:

- **Public (unauthenticated).** Official **district revision** metadata and their **GeoJSON geometry**
  from `geo.districts` — this is electoral-authority data, appropriate for maps, labels, and
  independent audit. Exposed by the area catalog (`GET /v1/public/jurisdictions`,
  `…/jurisdictions/:id/districts`, `…/districts/:revisionId/geometry`; see
  [`api/README.md`](../api/README.md)), keyed by effective-dated `asOf`.
- **Internal only.** Custom `geo.regions` presets and arbitrary stored polygons, sub-riding
  voting-area tiles, participant geocode points, and any **freeform district-id list** query surface.
  Filtering on unauthenticated routes stays the coarse `GeoScope` enum on `…/:id/counts`; there is
  never a public "is user *U* in district *D*" answer.

## Participant geocode (private input to `contains`)

A participant's address is geocoded into a **private point** — the future input to `region.contains`.
This is structural **resolvability**, not residency/KYC, and stores no district/region id. Two `auth`
tables hold it (PRIVATE PII; never on any HTTP response; see [`api/README.md` § Geocoding](../api/README.md)):

- `auth.profile_geocodes` — the participant's **current** point (one row per user).
- `auth.profile_geocode_history` — **append-only** log of every distinct address→point they've resolved to.

A later phase will choose, per jurisdiction config, **which point** a scoped filter binds to:

| Filter mode | Point source | Question it answers |
|---|---|---|
| `current` | `auth.profile_geocodes` | Where is the participant **now**? **(live on counts)** |
| `at_action` | per-action snapshot at civic-write time (**C4**, not built) | Where were they **when they acted**? |
| `ever_in_region` | `auth.profile_geocode_history` ∪ action snapshots | Have they **ever** been in region? |

**Shipped today:** `current` mode on `/counts` only. Geocoding on register is best-effort; no usable point ⇒ out-of-area for scoped geo. Action-time and ever-in-region modes are not built.

## Discussion-scoped stake filtering (C7)

How a public discussion answers "how much of this conversation comes from the impacted area?" — the
**region-first** model, no user/district query parameters. **Now wired** on the public count endpoints
(`/v1/public/{posts,petitions,polls}/:id/counts`) for the geo `scope`; the KYC `tier` set is wired on
the same surface (`[mvp-c-kyc-stub]`, set membership over each participant's current tier, AND-combined
with geo).

- **Input: a discussion (root entity) id only.** The caller never supplies a user id or a district;
  there is no "who is in district D" surface to query.
- **Region:** derive the entity's geographic scope from its own governance rules —
  `RegionResolver.compileScope("impacted-region", { jurisdictionId, appliesToDistrictIds })` where
  `appliesToDistrictIds` comes from `EntityRules` (empty ⇒ whole jurisdiction at `asOf`). This is the
  `fromDistrictUnion` path; the result is one `Region`.
- **Participants:** the `authorPubkey` / `nullifier` of the comments, reactions, votes, and signatures
  **in that thread**. Resolve each to a private point with `ParticipantGeoService` and test membership
  with **`participantInRegion(ref, region)`** → `region.contains(point)`. Count code branches on the
  boolean, **never on raw district-id lists** (so one call site serves district / union / jurisdiction
  / custom scopes alike). No usable point ⇒ **out-of-area** (excluded from a scoped count; still in
  `all-public`).
- **Privacy.** A participant's riding is only ever inferred for: (a) the **authenticated** viewer
  themselves (`my-district`, via `viewerDistrictId`); (b) a **single-district entity** scope, where
  "in scope" reveals nothing beyond the entity's own already-public district; or (c) a fully
  **public** account that has opted in. Aggregate counts respect the k-anonymity floor (a scoped
  bucket with `0 < count < effectiveK` is suppressed to `{ count: null, suppressed: true }`;
  `effectiveK = max(platformMin, jurisdiction.privacy.kAnonymityFloor ?? platformDefault)`); raw
  membership of an identifiable third party is never returned.
- **Hard rule:** there must **never** be a public API that answers "is user *U* in district *D*".
  Membership is computed *inside* the count/filter service over a Region, and only aggregates leave it.

## Where it lives

- Schema: `geo/src/schema/geo.sql.ts` (`geo.districts`, `geo.regions`).
- Store / containment: `geo/src/store.ts` (`GeoStore`).
- Region + resolver: `geo/src/region.ts`, `geo/src/region-resolver.ts`.
- Pluggable ingest: `geo/src/ingest/source.ts` (`BoundarySource`, `ShapefileSource`), CLI
  `geo/scripts/ingest.ts`. Package guide: [`geo/README.md`](../geo/README.md).
