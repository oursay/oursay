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

The **`current`-mode resolver** is in place: `@oursay/api`'s `ParticipantGeoService` links a record
participant (`authorPubkey`=Pₜ, or a singleton's `nullifier`+`parentId`) to a `userId`, loads their
current point, and reverse-resolves the containing district revision via `GeoStore.districtContaining`
(the same effective-dated set as `forJurisdiction`). It exposes a `viewerDistrictId` for the
authenticated `my-district` scope. C7 wires these inputs into `compileScope` + the public read filter;
this layer never reimplements `contains` and never exposes points or linkage publicly.

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
