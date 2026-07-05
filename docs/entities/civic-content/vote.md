# Vote

## Definition

A cast ballot on a [Poll](./poll.md) — a signed record selecting one option. **Changeable by default** at the platform layer (the loose defaults are intentional); a jurisdiction tightens to final-once-cast via its config (`ab-ca-gov`: final; `oursay-global`: changeable before deadline).

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
| `signScheme` | `SignScheme` | yes | yes | Per jurisdiction + per entity gate (AB: `webauthn-es256`; Global: `p256` quick-sign accepted) |
| `nullifier` | TEXT | yes | yes | Dedupe |
| `parent_id` | UUID | yes | yes | Poll entity id |

\* Anonymous verified vote shows tier only, not display name (contributor §9.3).

Action metadata (product §9): geographic area at time of action, tier at time of action, anonymity flag.

## States & lifecycle

```
[create vote — changeable by default; final where the jurisdiction tightens (AB)]
    │ if allowChange + before deadline
    ▼
[update vote — change option]
```

Allowed ops: `create`, `update` only — **never deleted**.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| Poll | N:1 | Parent poll |
| Nullifier | 1:1 | One per user per poll |
| Result | N:1 | Aggregated into poll close outcome |

## Invariants

- **R1a (jurisdiction-config finality)**: changeable by default at the platform layer; a jurisdiction/entity tightens to final (`ab-ca-gov`: `allowChange: false`); `update` only when rules + deadline allow.
- Signed with at least the jurisdiction's `gates.vote.signMin` method — the effective method is the **stronger** of the account's signing preference and the jurisdiction floor. `ab-ca-gov` floors votes at passkey (`webauthn-es256`, UV); `oursay-global` accepts quick-sign (`p256`). See [jurisdiction.md](../partitioning/jurisdiction.md) gates.
- Verified votes on-ledger with pseudonymous key link (contributor §9.3).
- No duplicate voting — nullifier + UNIQUE constraint.
- Verified anonymous votes counted in tier totals.

## Permissions

| Action | Who |
|--------|-----|
| Create (cast) | Per jurisdiction `gates.vote.act` during active period — `oursay-global`: any registered user; `ab-ca-gov`: **jurisdiction residency** (residency-verified AND resident of Alberta), **official-role holders denied** (officials cannot vote in AB) |
| Update (change) | Voter, if `allowChange` + before deadline |

The **official count** follows `gates.vote.officialCount` — `oursay-global`: `{identity_verified, residency_verified}`; `ab-ca-gov`: jurisdiction residency (participation-gated, so the count floor = act set). It is a **counting floor after the action, never a participation barrier**: where the act gate admits below-floor voters (Global), their ballots land in the unverified counts until they verify.

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
