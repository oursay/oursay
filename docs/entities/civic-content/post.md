# Post

## Definition

An informal statement of sentiment that users create and others agree or disagree with. The starting point for civic conversation in the four-level hierarchy: Statement → Petition → Poll → Result. The record type is `post`; **Statement** is its default user-facing label.

## Aliases

| Layer | Name |
|-------|------|
| Record type | `post` |
| Product label (default / Alberta) | **Statement** (`JurisdictionConfig.labels.post`) |
| Reactions | Agree = `reaction` kind `check`; Disagree = `cross` |

Product labels are per-jurisdiction; never use a label as a dev term. See [GLOSSARY.md](../../GLOSSARY.md) and [01-CONTRIBUTOR-SPEC.md §8.1](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on root `post` create transaction. Stable across updates/deletes.

## Attributes

Target field model (see **Gaps** for current code drift):

| Field | Type | Required | Public | Max | Source |
|-------|------|----------|--------|-----|--------|
| `title` | string | **yes** | yes | 200 | Content JSON |
| `body` | string | no | yes | 2000 | Statement text |
| `authorPubkey` | TEXT | yes | yes | — | Pₜ or anonymous display |
| `createdAt` | ISO 8601 | yes | yes | — | Envelope |
| `category/tags` | string[] | no | yes | — | Product extension |
| `links to petitions` | UUID[] | no | yes | — | Optional many — product layer |

Max lengths are the jurisdiction's `contentLimits` (target; AB: title 200, body 2000). See [jurisdiction.md](../partitioning/jurisdiction.md).

### Derived counts

| Count | Source |
|-------|--------|
| Agree (total \| by tier) | `reaction` kind `check` |
| Disagree (total \| by tier) | `reaction` kind `cross` |

List/detail: reaction tallies are **unfiltered** totals. Scoped counts via `/counts` endpoint.

## States & lifecycle

```
[create post]
    │ update (edit title/body)
    │ delete (admin archive)
    ▼
[active until deleted]
```

Posts do not expire unless archived by administrator.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Reaction | 1:N | Agree/disagree per user |
| Comment | 1:N | Discussion thread |
| Petition | N:M | Optional links (product layer) |
| ThreadPersona | 1:1 author | Per user in thread |

## Invariants

- **R1**: `post` is a root type — no parent. It is a thread root and carries the thread audience (`jurisdictionId` + `appliesToRegion` + `appliesToVerified`; see [entity-rules.md](../partitioning/entity-rules.md)). As a **root entity** it is bound to **exactly one jurisdiction** (`jurisdictionId`), defaulting to **`oursay-global`** when none is chosen (backend, frontend enforces a choice) — the same binding invariant holds for `petition` and `poll` roots (see [jurisdiction.md](../partitioning/jurisdiction.md) Invariants).
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

**Valid:** Registered user creates a Statement titled "Invest in a renewable grid" → others react check/cross.

**Invalid:** Guest creating a post — guests browse only (contributor §4.1).

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `PostContent` in `public-record/src/schema/types.ts` |
| Read | `GET /v1/public/posts`, `/:id`, `/:id/counts` |
| Write | Civic prepare/submit via `civic-record.routes.ts` |

## Gaps

- **Field model drift (RESOLVED 2026-06-27)** — `PostContent` is now `{ title: string; body?: string }` in `public-record/src/schema/types.ts`: `title` **required** (≤200), `body` **optional** (≤2000), enforced at create *and* update by `validateContent` (`public-record/src/schema/content.ts`) against the jurisdiction's `JurisdictionConfig.contentLimits` (falling back to `DEFAULT_CONTENT_LIMITS`). *History:* it was previously `{ title?: string; body: string }` (body required, title optional, no max lengths). Tracked in `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-post-content-fields]`.
- Category/tags linking not fully specified in schema — product extension on content JSON.
- Action-time geo/tier snapshots for historical counts ([mvp-c4-action-snapshots]).
