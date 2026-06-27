# Reaction

## Definition

A lightweight agree/disagree signal on a [Statement](./post.md) (`post`) or on another comment. Recorded as `✓` (agree) or `✗` (disagree). Mutually exclusive per author per target.

## Aliases

| Layer | Name |
|-------|------|
| Product | Agree / disagree |
| Record type | `reaction` |
| Kinds | `✓` = agree, `✗` = disagree |

See [01-CONTRIBUTOR-SPEC.md §9.1](../../01-CONTRIBUTOR-SPEC.md).

## Identity

- Entity: `entity_id` on reaction transaction.
- Uniqueness: one active reaction per `(author, target)` via [Nullifier](../civic-identity/nullifier.md).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `kind` | `✓` \| `✗` | yes | yes | Reaction kind |
| `authorPubkey` | TEXT | yes | yes | |
| `parent_type` | `post` \| `comment` | yes | yes | |
| `parent_id` | UUID | yes | yes | Target entity |
| `parent_revision_tx_id` | UUID | yes | yes | R1b revision pin |
| `parent_revision_hash` | TEXT | yes | yes | |
| `nullifier` | TEXT | yes | yes | Singleton dedupe |

## States & lifecycle

```
[create reaction — check or cross]
    │ update (change position)
    ▼
[active reaction — one kind at a time]
```

Users may change agree ↔ disagree (update op). Allowed ops: `create`, `update`, `delete`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Post | N:1 | Primary target |
| Comment | N:1 | Secondary target |
| EntityProjection | aggregated | Per-entity and per-revision counts |

## Invariants

- **R1b**: Dual attachment — entity + revision counts separately.
- Mutually exclusive kinds per author per target — one reaction, not both.
- Kinds `✓`/`✗` only today; extensible to custom emoji (R1).
- Verified reactions on-ledger; unverified off-ledger.
- Reaction tallies on list/detail are **unfiltered** totals (not geo/tier gated on embed).

## Permissions

| Action | Who |
|--------|-----|
| Create | Any registered user |
| Update | Author (change position) |
| Delete | Author |

## Events

- Create/update → count projection refresh.
- Scoped counts available via post `/counts` endpoint.

## Examples

**Valid:** User agrees (`✓`), later disagrees (`✗`) via update — position change allowed.

**Invalid:** Both `✓` and `✗` active simultaneously for same user on same post.

## Implementation

| Layer | Path |
|-------|------|
| REACTION_KINDS | `["✓", "✗"]` |
| Views | `active_reactions`, `reaction_counts_by_entity`, `reaction_counts_by_revision` |
| Read | `GET /v1/public/posts/:id/counts` |

## Gaps

- Custom emoji reactions — future extension (R1).
