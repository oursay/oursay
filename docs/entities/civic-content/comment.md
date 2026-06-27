# Comment

## Definition

A threaded discussion comment attached to any content item — belief, petition, public vote, result, or another comment. First-class committed record type.

## Aliases

| Layer | Name |
|-------|------|
| Product | Discussion comment / comment |
| Record type | `comment` |

See [01-CONTRIBUTOR-SPEC.md §10](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on `comment` create transaction.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `body` | string | yes | yes | Comment text |
| `authorPubkey` | TEXT | yes | yes | May be anonymous |
| `parent_type` | RecordType | yes | yes | post / petition / poll / comment |
| `parent_id` | UUID | yes | yes | Entity-level parent |
| `parent_revision_tx_id` | UUID | yes | yes | Revision pinning |
| `parent_revision_hash` | TEXT | yes | yes | Content-addressed revision |
| `createdAt` | ISO 8601 | yes | yes | |

Max nesting depth: **3 levels** below root entity (`COMMENT_MAX_DEPTH`).

## States & lifecycle

```
[create comment]
    │ update (edit body)
    │ delete (moderation)
    ▼
[active | deleted | redacted]
```

All comments — including removed — retain ledger hash for existence proof (contributor §10).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Belief/Petition/PublicVote/Result | N:1 | Root attachment |
| Comment | N:1 | Threaded replies |
| RecordTransaction | 1:N | Event log |

## Invariants

- **R1b [Invariant]**: MUST record both parent entity AND parent revision.
- **R1**: Nesting depth ≤ 3.
- Parent types: `post`, `petition`, `poll`, `comment` only.
- All registered users' comments committed (contributor §11.1 includes discussion comments).
- Moderation delete still preserves ledger hash.

## Permissions

| Action | Who |
|--------|-----|
| Create | Any registered user |
| Update | Author |
| Delete | Author or administrator (moderation) |
| Report | Any registered user |

## Events

- Create → outbox.
- Admin remove → delete op (hash retained).

## Examples

**Valid:** Reply to comment on petition, depth 2, with revision hash pinned to parent's current head.

**Invalid:** Comment at depth 4 — rejected.

## Implementation

| Layer | Path |
|-------|------|
| PARENT_RULES | comment → post/petition/poll/comment |
| Depth constant | `COMMENT_MAX_DEPTH = 3` |
| Projection | `public-record/src/projection.ts` → `ThreadComment` |

## Gaps

- Engagement signals (likes on comments) left to contributor discretion — not specified in schema.
