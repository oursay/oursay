# PublicVote

## Definition

A formal binary or multiple-choice vote put to the community — the question/container in the record layer. Carries the greatest formal weight on the platform. Product name: **Public Vote**; record type: **`poll`**.

## Aliases

| Layer | Name |
|-------|------|
| Product | Public Vote |
| Record type | `poll` |
| Ballots | [Vote](./vote.md) entities |

See [01-CONTRIBUTOR-SPEC.md §8.3](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on root `poll` create transaction.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `question` | string | yes | yes | Content JSON |
| `options` | string[] | yes | yes | Min Yes/No; more allowed |
| `rules` | EntityRules | no | yes | Deadline, allowChange, district scope |
| `description` | string | no | yes | Full context (product) |
| `authorPubkey` | TEXT | yes | yes | |
| `voting period` | open/close ISO | yes | yes | Product metadata |
| `links to petitions` | UUID[] | no | yes | Optional many |

### Product status

| Status | Meaning |
|--------|---------|
| `upcoming` | Before open time |
| `active` | Accepting votes |
| `closed` | Voting period ended |
| `result published` | [Result](./result.md) available |

### Derived counts

Vote counts per option (total \| by tier) — policy-gated on list/detail; geo/tier filterable on `/counts`.

## States & lifecycle

```
[upcoming]
    ▼ open
[active — accepting votes]
    ▼ close (deadline / admin)
[closed]
    ▼ result generation
[result published]
```

Public vote creation may be gated by petition signature threshold (future).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Vote | 1:N | One ballot per user (singleton) |
| Result | 1:1 | Derived at close |
| Petition | N:M | Optional upstream links |
| Comment | 1:N | Discussion |
| EntityRules | 1:1 | Embedded in create |

## Invariants

- **R1a**: Votes final by default; change only if `allowChange` + before deadline.
- Root type — no parent.
- Verified votes on-ledger; anonymous verified votes counted in tier totals (contributor §9.3–9.4).
- Ballots are `vote` records, not embedded in poll content.

## Permissions

| Action | Who |
|--------|-----|
| Create | Registered user (threshold gate future) |
| Vote | Any registered user |
| Update poll | Author / platform governance |
| Close | Deadline or administrator |

## Events

- Close → trigger result generation (gap).
- Votes update `poll_results` projection.

## Examples

**Valid:** Poll with `{ options: ["Yes", "No"], rules: { allowChange: false, deadline: "2026-07-01T00:00:00Z" } }`.

**Invalid:** Changing vote after deadline when `allowChange: false` — rejected.

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `{ question, options[], rules? }` |
| Read | `GET /v1/public/polls`, `/:id`, `/:id/counts` |
| Results view | `poll_results` |

## Gaps

- **[mvp-c12-poll-results]**: No formal derived `result` entity publish at close.
- Creation threshold from linked petition not implemented.
