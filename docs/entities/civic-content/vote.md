# Vote

## Definition

A cast ballot on a [PublicVote](./public-vote.md) — a signed record selecting one option. The real-world analog of casting a vote: **final once cast by default**.

## Aliases

| Layer | Name |
|-------|------|
| Product | Vote / ballot / cast |
| Record type | `vote` |
| Parent | `poll` |

See [01-CONTRIBUTOR-SPEC.md §8.3, §9.3](../../01-CONTRIBUTOR-SPEC.md).

## Identity

- Entity: `entity_id` on vote transaction.
- Uniqueness: one active vote per `(author, poll)` via [Nullifier](../civic-identity/nullifier.md).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `option` | string | yes | yes* | Selected option label |
| `authorPubkey` | TEXT | yes | yes | Pₜ |
| `signerPubkey` | TEXT | yes | yes | Device passkey |
| `signScheme` | `"webauthn-es256"` | yes | yes | Required |
| `nullifier` | TEXT | yes | yes | Dedupe |
| `parent_id` | UUID | yes | yes | Poll entity id |

\* Anonymous verified vote shows tier only, not display name (contributor §9.3).

Action metadata (product §9): geographic area at time of action, tier at time of action, anonymity flag.

## States & lifecycle

```
[create vote — FINAL by default]
    │ if allowChange + before deadline
    ▼
[update vote — change option]
```

Allowed ops: `create`, `update` only — **never deleted**.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| PublicVote | N:1 | Parent poll |
| Nullifier | 1:1 | One per user per poll |
| Result | N:1 | Aggregated into poll close outcome |

## Invariants

- **R1a**: Cast FINAL by default; `update` only when rules + deadline allow.
- **MUST** use `webauthn-es256`.
- Verified votes on-ledger with pseudonymous key link (contributor §9.3).
- No duplicate voting — nullifier + UNIQUE constraint.
- Verified anonymous votes counted in tier totals.

## Permissions

| Action | Who |
|--------|-----|
| Create (cast) | Any registered user during active period |
| Update (change) | Voter, if `allowChange` + before deadline |

## Events

- Cast → `record_tx` + outbox.
- Change → `update` op with same nullifier.

## Examples

**Valid:** User votes "Yes", then changes to "No" before deadline with `allowChange: true`.

**Invalid:** Deleting a vote — op not permitted at model level.

## Implementation

| Layer | Path |
|-------|------|
| ALLOWED_OPS | `create`, `update` |
| Parent rule | `vote` → `poll` only |
| Counts | `poll_results` view |

## Gaps

- **[mvp-c4-action-snapshots]**: Geo/tier at cast time not snapshotted.
