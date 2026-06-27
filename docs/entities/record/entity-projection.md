# EntityProjection

## Definition

The **fold-on-read** view of a record entity — current state, counts, and public read shapes derived from the append-only `record_tx` log. Projections power list/detail APIs without mutating the event log.

## Aliases

| Layer | Name |
|-------|------|
| Code | `entity_state`, `PublicEntityView`, `EntityState` |
| Views | `entity_current_revision`, `active_reactions`, `poll_results`, etc. |

## Identity

Projection keyed by `entity_id` (UUID) for entity state; count projections keyed by `(parent_id, …)` or `(entity_id, option)`.

## Attributes

### entity_state (core fold)

| Derived field | Meaning |
|---------------|---------|
| Latest tx per `entity_id` | Head of entity chain |
| `is_deleted` | Latest op is delete |
| `is_redacted` | Content withheld |
| `is_erased` | Plaintext destroyed |

### PublicEntityView (API read shape)

Exposes public fields from folded content + metadata. Withholds redacted/erased entities.

### Count projections

| View | Purpose |
|------|---------|
| `active_reactions` | Current reactions per target |
| `reaction_counts_by_entity` | Agree/disagree totals |
| `reaction_counts_by_revision` | Per-revision endorsement counts (R1b) |
| `active_signatures` | Current petition signatures |
| `petition_signature_counts` | Signature scalars |
| `poll_results` | Vote tallies per option |

### CountGating (jurisdiction policy)

| Value | Meaning |
|-------|---------|
| `none` | Scalars exposed |
| `withheld` | Scalars hidden |
| `tier-gated` | Exposed only when request tier ⊆ `minTier` |

## States & lifecycle

Projections are **derived** — recomputed on read from `record_tx`. No independent lifecycle.

```
[append record_tx]
        ▼
[views reflect new head / counts on next query]
```

Geo/tier filtering on counts applies at **read time** via `ParticipantGeoService` + `KycService`, not in base views.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| RecordTransaction | N:1 | Source event log |
| Post/Petition/Poll | 1:1 | One projection per root entity |
| Jurisdiction | N:1 | Count gating from config |

## Invariants

- **R1b**: Count support per-entity AND per-revision for reactions.
- List/detail tallies: reactions unfiltered; petition/poll scalars policy-gated but not geo/tier-filtered.
- **`GET …/:id/counts` only**: geo (`scope`) + tier filtering + k-anonymity ([REGION-MODEL.md](../../REGION-MODEL.md)).
- k-anonymity floor: suppress narrow buckets when geo or tier narrows.

## Permissions

| Action | Who |
|--------|-----|
| Read projections | Public (guests for public content) |
| Read filtered counts | Public; `my-district` needs auth (gap) |

## Events

- Read path: `PublicRecordReadService` folds entity + applies gating/filters.

## Examples

**Valid:** `GET /v1/public/polls/:id/counts?scope=impacted-region&tier=residency_verified` → filtered tallies with `applied.geo: true`.

**Invalid:** Expecting list endpoint embedded tallies to respect `scope` — by design they do not.

## Implementation

| Layer | Path |
|-------|------|
| DDL views | `public-record/src/schema/postgres.sql.ts` |
| Projection logic | `public-record/src/projection.ts` |
| Read service | `api/src/services/public-record-read.service.ts` |
| Routes | `api/src/http/routes/public-record-read.routes.ts` |
| Store types | `public-record/src/private/store.ts` → `PublicEntityView` |

## Gaps

- **[mvp-c4-action-snapshots]**: Counts use current geo/tier, not at-action snapshots.
- **[mvp-c4b-date-filters]**: `from`/`to` on counts stubbed.
- **[mvp-c13-signed-count-snapshots]**: No signed count manifests.
- **[mvp-c12-poll-results]**: Formal immutable result projection at poll close.
