# Poll

## Definition

A formal binary or multiple-choice vote put to the community — the question/container in the record layer. Carries the greatest formal weight on the platform. Record type: **`poll`**; default user-facing label: **Poll** (a rollback from the retired product term *Public Vote*). A user's individual ballot is a [`vote`](./vote.md); "public vote" refers only to that ballot, never to this container.

## Aliases

| Layer | Name |
|-------|------|
| Record type | `poll` |
| Product label (default / Alberta) | **Poll** (`JurisdictionConfig.labels.poll`) |
| Ballots | [Vote](./vote.md) entities |

See [GLOSSARY.md](../../GLOSSARY.md) and [01-CONTRIBUTOR-SPEC.md §8.3](../../01-CONTRIBUTOR-SPEC.md).

## Identity

Primary key: `entity_id` (UUID) on root `poll` create transaction.

## Attributes

| Field | Type | Required | Public | Max | Source |
|-------|------|----------|--------|-----|--------|
| `question` | string | yes | yes | 200 | Content JSON |
| `options` | string[] | yes | yes | ≤10 options, 100 each | Min Yes/No; more allowed |
| `rules` | EntityRules | no | yes | — | Deadline, allowChange, audience |
| `description` | string | no | yes | 2000 | Full context (product) |
| `authorPubkey` | TEXT | yes | yes | — | |
| `voting period` | open/close ISO | yes | yes | — | Product metadata |
| `links to petitions` | UUID[] | no | yes | — | Optional many |

Max lengths are the jurisdiction's `contentLimits` (target; AB: question 200, option 100, max 10 options, description 2000). See [jurisdiction.md](../partitioning/jurisdiction.md).

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

Poll creation may be gated by petition signature threshold (future).

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
- Root type — no parent. It is a thread root and carries the thread audience (`jurisdictionId` + `appliesToRegion` + `appliesToVerified`; see [entity-rules.md](../partitioning/entity-rules.md)).
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

**Valid:** Poll with `{ question, options: ["Yes", "No"], rules: { allowChange: false, deadline: "2026-07-01T00:00:00Z" } }`.

**Invalid:** Changing a vote after the deadline when `allowChange: false` — rejected.

## Implementation

| Layer | Path |
|-------|------|
| Content shape | `PollContent` (`{ question, options[], rules? }`) in `public-record/src/schema/types.ts` |
| Read | `GET /v1/public/polls`, `/:id`, `/:id/counts` |
| Results view | `poll_results` |

## Gaps

- **[wireframe-poll-options] (2026-06-29)** — The mobile compose wireframe (`wireframes/mobile/app-frame.svg`) seeds **2 options** (the Yes/No baseline) with an **add-option** control up to the jurisdiction's max. This matches the `options` spec above. **Technical teams:** wire the composer's cap to the per-jurisdiction **`contentLimits` maxPollOptions** (default 10) — do **not** hardcode 10 in the client.
- **Content-limit enforcement (RESOLVED 2026-06-27)** — `question` is **required** (non-empty, AB: ≤200) and `options` is **required** (non-empty array, AB: ≤10 options, each a string ≤100); an optional `description` is capped (AB: 2000) when present. Enforced at create *and* update by `validateContent` (`public-record/src/schema/content.ts`) against the jurisdiction's `JurisdictionConfig.contentLimits` (falling back to `DEFAULT_CONTENT_LIMITS`); see the [jurisdiction.md](../partitioning/jurisdiction.md) contentLimits table. `rules` (EntityRules) is untouched; `description` is not yet a field on `PollContent`. Completed alongside `post` ([code-post-content-fields]).
- **[mvp-c12-poll-results]**: No formal derived `result` entity publish at close.
- Creation threshold from linked petition not implemented.
