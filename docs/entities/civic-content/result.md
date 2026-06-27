# Result

## Definition

The immutable, published outcome of a closed [PublicVote](./public-vote.md). Formal capstone of the content hierarchy. **Derived/published** — not a user-appended record type in the current implementation.

## Aliases

| Layer | Name |
|-------|------|
| Product | Result |
| Record type | `result` (derived — future formal publish) |
| Current | `poll_results` view (live recomputed counts) |

See [01-CONTRIBUTOR-SPEC.md §8.4](../../01-CONTRIBUTOR-SPEC.md).

## Identity

One result per closed public vote. Linked to exactly one poll `entity_id`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `linked public vote` | UUID | yes | yes | Exactly one poll |
| `final vote counts per option` | map | yes | yes | Total \| by tier |
| `geographic breakdown` | nested | yes | yes | Per hierarchy level |
| `tier breakdown` | map | yes | yes | |
| `publication timestamp` | ISO 8601 | yes | yes | |
| `ledger audit reference` | string | yes | yes | Anchor / block ref |
| `discussion thread` | comments | no | yes | Same as other content |

### Current implementation (`poll_results` view)

Live recomputed vote tallies per option — honest presentation as live counts until formal result publish lands.

## States & lifecycle

```
[poll closed]
    ▼ generate + publish
[result published — IMMUTABLE]
```

No editing or deletion after publication.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| PublicVote | 1:1 | Exactly one source poll |
| Petition / Belief | transitive | Via poll links upstream |
| PublicRecord | 1:1 | Anchored on ledger |

## Invariants

- Immutable once published — no edit, no delete (contributor §8.4).
- Publicly visible to all including guests.
- Every result anchored for independent verification.
- Described as "designed to be tamper-resistant" — not guaranteed permanent by platform.
- **R1**: `result` is derived/published, not user append.

## Permissions

| Action | Who |
|--------|-----|
| Generate | Platform at poll close |
| Read | Anyone (including guests) |
| Update/delete | **Never** after publish |

## Events

- Poll close → result generation (target).
- Publish → ledger anchor + notification.

## Examples

**Valid (target):** Closed poll publishes result with tier + geographic breakdown and anchor reference.

**Invalid:** User appending a `result` record type directly — not a user append operation.

## Implementation

| Layer | Path |
|-------|------|
| View (interim) | `poll_results` in postgres.sql.ts |
| Read | Poll detail + counts endpoints |
| Formal publish | Not implemented |

## Gaps

- **[mvp-c12-poll-results]**: No derived `result` entity at poll close — primary launch gap.
- Geographic breakdown at result publish not formalized.
- Signed count manifests ([mvp-c13-signed-count-snapshots]).
