# Belief

## Definition

An informal statement of sentiment that users create and others agree or disagree with. The starting point for civic conversation in the four-level hierarchy: Belief → Petition → Public Vote → Result.

## Aliases

| Layer | Name |
|-------|------|
| Product | Belief |
| Record type | `post` |
| Reactions | Agree = `reaction` kind `check`; Disagree = `cross` |

See [01-CONTRIBUTOR-SPEC.md §8.1](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on root `post` create transaction. Stable across updates/deletes.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `title` | string | no | yes | Content JSON |
| `body` | string | yes | yes | Statement text |
| `authorPubkey` | TEXT | yes | yes | Pₜ or anonymous display |
| `createdAt` | ISO 8601 | yes | yes | Envelope |
| `category/tags` | string[] | no | yes | Product extension |
| `links to petitions` | UUID[] | no | yes | Optional many — product layer |

### Derived counts

| Count | Source |
|-------|--------|
| Agree (total \| by tier) | `reaction` kind `check` |
| Disagree (total \| by tier) | `reaction` kind `cross` |

List/detail: reaction tallies are **unfiltered** totals. Scoped counts via `/counts` endpoint.

## States & lifecycle

```
[create post]
    │ update (edit body/title)
    │ delete (admin archive)
    ▼
[active until deleted]
```

Beliefs do not expire unless archived by administrator.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Reaction | 1:N | Agree/disagree per user |
| Comment | 1:N | Discussion thread |
| Petition | N:M | Optional links (product layer) |
| ThreadPersona | 1:1 author | Per user in thread |

## Invariants

- **R1**: `post` is root type — no parent.
- Verified user reactions on-ledger; unverified off-ledger (contributor §11.1).
- Users may change agree/disagree position (reaction update allowed).
- Anonymous participation permitted; verified anonymous counted in tier totals (contributor §9.4).

## Permissions

| Action | Who |
|--------|-----|
| Create | Any registered user |
| Update | Author |
| Delete | Author or administrator |
| React | Any registered user |
| Comment | Any registered user |

## Events

- Create/update/delete → `record_tx` + outbox.
- Reactions update count projections.

## Examples

**Valid:** Registered user creates belief "Alberta should invest in renewable grid infrastructure" → others react check/cross.

**Invalid:** Guest creating a belief — guests browse only (contributor §4.1).

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `public-record/src/schema/types.ts` |
| Read | `GET /v1/public/posts`, `/:id`, `/:id/counts` |
| Write | Civic prepare/submit via `civic-record.routes.ts` |

## Gaps

- Category/tags linking not fully specified in schema — product extension on content JSON.
- Action-time geo/tier snapshots for historical counts ([mvp-c4-action-snapshots]).
