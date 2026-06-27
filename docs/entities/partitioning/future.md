# Partitioning — future / deferred

Deferred design intent for the `partitioning/` entities (jurisdiction, district, region, entity-rules). Not shipped.

## Thread audience model
Remaining `EntityRules` audience axis (the raw `appliesToDistrictIds` array is now a deprecated alias):
- **`appliesToRegion`** — *shipped*: a `RegionRef` — `jurisdiction` / `district:<district_slug>` (stable seat) / `revision:<revisionId>` (pinned version) / `region:<presetId>` / `{op:and|or|not, refs}` unions.
- **`appliesToVerified`** — minimum KYC tier **set** counting toward stake/official totals.
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-applies-to-verified]`.

## entity_audience materialized projection
A materialized **`entity_audience`** projection mapping each root entity to its resolved region(s) for fast district-page listing ("show every thread that applies to this riding"). Today audience is read from entity rules at query time.
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-entity-audience-projection]`.

## JurisdictionConfig labels + contentLimits
Add per-jurisdiction **`labels`** (post/petition/poll/result/district user-facing labels) and **`contentLimits`** (hard caps per type). Today `JurisdictionConfig` has neither.
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-jurisdiction-labels-limits]`.

## allowChange / allowRevoke unification
Collapse the two governance flags into a single `allowChange` field covering both vote change and signature revoke. The deadline gates both submit and change/revoke.

## Multi-jurisdiction regions
A region is, in theory, multi-jurisdiction-capable; discussions remain jurisdiction-scoped for now. The cross-jurisdiction region path is future. Related: API container still uses a single deployment-default chain for some write paths ([mvp-c10-multi-jurisdiction]); user ↔ jurisdiction membership ([mvp-c10b-membership]).

## Region presets + history filters
- Platform-created custom region presets via service/API ([mvp-c5-region-presets]).
- `scope=my-district` with authenticated counts context ([mvp-c4c-my-district]).
- History-based "ever in region" filter mode ([mvp-c11-ever-in-region]).

## Platform-signed boundary revisions
District redraws published as platform-signed records (see [record/future.md](../record/future.md)).
