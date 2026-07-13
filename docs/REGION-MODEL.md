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

> **Term & migration note.** The term **Region** is retained. A thread declares its geographic stake
> through **`appliesToRegion`** (a RegionRef — `"jurisdiction"` / `"district:<district_slug>"` /
> `"revision:<revisionId>"` / `"region:<presetId>"` / `{op:"and"|"or"|"not", refs}` unions), **not** a raw
> district-id array as *input* on the public surface. The code seam below reads `EntityRules.appliesToRegion`
> (`RegionResolver.resolveRegionRef`); `EntityRules.appliesToDistrictIds` is **kept** as the region's
> server-maintained **district-slug projection** (served on read DTOs for per-thread district
> resolution; an author-supplied id list maps to an OR-of-revisions RegionRef). Stable district pages key off the year-less
> **`district_slug`** (`"district:<district_slug>"`); revision ids (`id`) address a specific boundary
> version for history (`"revision:<revisionId>"`). A region is, in theory, multi-jurisdiction-capable, but
> discussions stay jurisdiction-scoped for now — the cross-jurisdiction path is future
> ([`entities/partitioning/future.md`](entities/partitioning/future.md)).

## Boundaries are effective-dated, not year-keyed

`geo.districts` holds one row per boundary **revision**:

- **`id`** — stable revision identity, a year-anchored slug (`edmonton-strathcona-2019`, with a `-{n}` suffix when a second set lands the same calendar year, `…-2019-2`).
- **`effective_date`** (required) — the first day this geometry is in force. **This is the lookup key.**
- **`drawn_date`** (optional) — when the map was drawn/enacted, if known (e.g. Alberta Bill-33, 2017‑12‑15).
- **`boundary_year`** — slug/display only, derived from `effective_date`.
- **`district_slug`** — year-less logical-seat key, so revisions of the same seat group across redraws.

**`asOf` resolution.** `forJurisdiction(jurisdictionId, asOf)` selects districts with
`effective_date <= asOf`, then **one revision per `district_slug`** by the tie-break **latest
`effective_date`** (`DISTINCT ON (district_slug) … ORDER BY effective_date DESC`). So a redraw is just a
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
| `impacted-region` | `resolveRegionRef(appliesToRegion)`; absent ⇒ whole jurisdiction at `asOf` (an author-supplied district-id stake maps to an OR-of-revisions RegionRef) |
| `my-district` | the **authenticated** viewer's district, or `null` (inert when no session — public reads accept an **optional** session; see "Author-geo relations" below) |
| `all-public` | `null` (no geo filter) |

The count path passes **`asOf = now`** (current-point mode pairs with the current boundary set);
`impacted-region` resolves the entity's `appliesToRegion`. A `"revision:<id>"` (or raw
revision-id list) stake is asOf-independent; a `"district:<district_slug>"` stable-seat ref resolves
to the revision in force at `asOf`. `resolveRegionRef`/`compileScope` accept an **`asOf`** (entity
creation time, poll open, …) for later modes. **Which instant binds is future jurisdictional config:** a
deployment will choose creation-time vs resolution-time vs an advertised count-snapshot instant for public
consumption; the platform may filter at either point, and a snapshot is **advertisement only** (the signed
record is unchanged). `EntityRules.appliesToRegion` ([governance](../public-record/src/governance.ts))
compiles to a `Region` (a `district_union` for a pure OR of districts; a `composite` for and/not).

Privacy ([06 §2–3](06-PRIVACY-REVIEW.md)): public geography stays **coarse**. The protected risk is
**user points and fine-grained slicing**, not official electoral boundaries. Concretely:

- **Public (unauthenticated).** Official **district revision** metadata and their **GeoJSON geometry** from `geo.districts` — this is electoral-authority data, appropriate for maps, labels, and independent audit. Exposed by the area catalog (`GET /v1/public/jurisdictions`, `…/jurisdictions/:id/districts`, `…/districts/:revisionId/geometry`; see [`api/README.md`](../api/README.md)), keyed by effective-dated `asOf`.
- **Internal only.** Custom `geo.regions` presets and arbitrary stored polygons, sub-riding voting-area tiles, participant geocode points, and any **freeform district-id list** query surface. Filtering on unauthenticated routes stays the coarse `GeoScope` enum on `…/:id/counts`; there is never a public "is user *U* in district *D*" answer.

## Participant geocode (private input to `contains`)

On residency / POA, OurSay **receives coords and/or an address from the KYC seam**, resolves a
**private point** — the input to `region.contains`. Prefer Didit `document_location` when present;
otherwise geocode the structured address. The street-address string is **not** retained on the
profile (Didit keeps identity/address text PII). This is structural **resolvability**, not a
stored district/region id. Two `auth` tables hold the point (PRIVATE location data; never on any
HTTP response; see [`api/README.md` § Geocoding](../api/README.md) and
[`entities/account/profile-geocode.md`](entities/account/profile-geocode.md)):

- `auth.profile_geocodes` — the participant's **current** point (one row per user).
- `auth.profile_geocode_history` — **append-only** log of every distinct location→point they've resolved to
  (`address_hash` for invalidation only — not a recoverable street address; conceptually a
  **location hash**: rounded-coord hash when a point exists, else normalized-address hash).

**Service policy:** `GeocodeService` does **not** refuse or clear by country (Canada-only stays on the
dev stub provider). Stored points from a resolved location are rounded to **3 decimal places (~100 m)**;
upsert only when the location hash changes. Future boundary-change reverify (2×2 rounding candidates
near a moved edge) is documented on [profile-geocode.md](entities/account/profile-geocode.md) /
[account/future.md](entities/account/future.md) — not evaluated at POA-approve time.

**Encryption note:** Column-level encryption of `geom` is **likely incompatible** with PostGIS GiST /
`ST_Contains` (ciphertext cannot be spatially indexed). Working assumption: store queryable points;
use volume/disk encryption + access control. Details and uncertainty:
[`entities/account/profile-geocode.md`](entities/account/profile-geocode.md) (*Encryption vs spatial index*).

A later phase will choose, per jurisdiction config, **which point** a scoped filter binds to:

| Filter mode | Point source | Question it answers |
|---|---|---|
| `current` | `auth.profile_geocodes` | Where is the participant **now**? **(live on counts)** |
| `at_action` | per-action snapshot at civic-write time (**C4**, not built) | Where were they **when they acted**? |
| `ever_in_region` | `auth.profile_geocode_history` ∪ action snapshots | Have they **ever** been in region? |

**Shipped today:** `current` mode on `/counts` only. Didit POA Approved drives the private point from
ephemeral decision intake. Registration / profile PATCH may still geocode from legacy address fields
(drift). No usable point ⇒ out-of-area for scoped geo.
Action-time and ever-in-region modes are not built.

## Discussion-scoped stake filtering (C7)

How a public discussion answers "how much of this conversation comes from the impacted area?" — the
**region-first** model, no user/district query parameters. **Now wired** on the public count endpoints
(`/v1/public/{posts,petitions,polls}/:id/counts`) for the geo `scope`; the KYC `tier` set is wired on
the same surface (`[mvp-c-kyc-stub]`, set membership over each participant's current tier, AND-combined
with geo).

- **Input: a discussion (root entity) id only.** The caller never supplies a user id or a district; there is no "who is in district D" surface to query.
- **Region:** derive the entity's geographic scope from its own governance rules — `RegionResolver.compileScope({ scope: "impacted-region", jurisdictionId, appliesToRegion })` where `appliesToRegion` (a RegionRef) comes from `EntityRules` (absent ⇒ whole jurisdiction at `asOf`; an author-supplied district-id stake is mapped to an OR-of-revisions RegionRef). The result is one `Region` (district / union / jurisdiction / custom / composite).
- **Participants:** the `authorPubkey` / `nullifier` of the comments, reactions, votes, and signatures **in that thread**. Resolve each to a private point with `ParticipantGeoService` and test membership with **`participantInRegion(ref, region)`** → `region.contains(point)`. Count code branches on the boolean, **never on raw district-id lists** (so one call site serves district / union / jurisdiction / custom scopes alike). No usable point ⇒ **out-of-area** (excluded from a scoped count; still in `all-public`).
- **Privacy.** A participant's riding is only ever inferred for: (a) the **authenticated** viewer themselves (`my-district`, via `viewerDistrictId`); (b) a **single-district entity** scope, where "in scope" reveals nothing beyond the entity's own already-public district; or (c) a fully **public** account that has opted in. Aggregate counts respect the k-anonymity floor (a scoped bucket with `0 < count < effectiveK` is suppressed to `{ count: null, suppressed: true }`; `effectiveK = max(platformMin, jurisdiction.privacy.kAnonymityFloor ?? platformDefault)`); raw membership of an identifiable third party is never returned.
- **Hard rule:** there must **never** be a public API that answers "is user *U* in district *D*". Membership is computed *inside* the count/filter service over a Region, and only aggregates leave it.

## Author-geo relations on read DTOs (relationships, never locations)

Beyond aggregate counts, read surfaces serve a per-author **spatial relation** so the UI can show
civic standing without ever shipping a location. Every record/comment DTO carries

```
authorGeo ∈ { "home", "affected", "jurisdiction", "none" }
```

— the author's **narrowest** relation to (viewer, open post), resolved server-side:

- **`home`** — the author resides in one of the **viewer's** home districts. Resolved **only for a residency-verified viewer** (the privileged case: it discloses district co-residency, nothing finer).
- **`affected`** — the author resides in the post's affected area (`appliesToRegion`).
- **`jurisdiction`** — in the post's jurisdiction but outside its affected area. Drops off on a jurisdiction-wide post (there everyone in-jurisdiction is `affected`).
- **`none`** — no contextual relation, below Residency, or no usable point.

Rules:

- Raw author districts **never leave the server**; the relation enum is the only residence signal on any DTO. The relation attaches to whatever identity surface the viewer is allowed to see (persona or revealed profile) — a private author still shows `affected` without their district ever being enumerable.
- Public read endpoints therefore take an **optional session**: anonymous requests get viewer-independent relations only (`home` never resolves); authenticated requests get the full resolution. Trade-off: the anonymous variant is the only CDN-cacheable one.
- **Timing:** the target binds the relation to the author's residence **at action time** (`at_action` snapshots, C4 — the same relationship-flags snapshot, never points); until snapshots land, **`current`** residence is the documented interim.
- **Deferred shortcut (discussed, not scheduled):** including the author's **verification tier in the record at write time** fakes at-action semantics cheaply — it exposes only *affected-or-not* (and could mark "was an official-role holder at action time"), adds **no jurisdiction or district data** to the record (a user's district must never appear in the public record; tier is acceptable), and powers a `Timeframe → current | at posting` refinement filter ("both" is hard, future-only). It cannot power a "my district" filter at-action nor arbitrary "status at time T" search. Not MVP — see [record/future.md](entities/record/future.md).
- This does not loosen the hard rule: there is still never a public "is user *U* in district *D*" query — the relation is computed server-side per (viewer, post, author) and only the enum leaves.

## Where it lives

- Schema: `geo/src/schema/geo.sql.ts` (`geo.districts`, `geo.regions`).
- Store / containment: `geo/src/store.ts` (`GeoStore`).
- Region + resolver: `geo/src/region.ts`, `geo/src/region-resolver.ts`.
- Pluggable ingest: `geo/src/ingest/source.ts` (`BoundarySource`, `ShapefileSource`), CLI `geo/scripts/ingest.ts`. Package guide: [`geo/README.md`](../geo/README.md).
