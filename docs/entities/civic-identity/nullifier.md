# Nullifier

## Definition

Platform-issued deduplication tag ensuring **at most one active singleton action** per user per parent entity (vote, petition signature, or reaction). Stored both in `nullifier_attestations` (platform) and on the envelope (`nullifier` field) for ledger dedupe.

## Aliases

| Layer | Name |
|-------|------|
| Code | `NullifierAttestation`, `nullifier_attestations` |
| Envelope field | `nullifier` |
| Singleton types | `vote`, `petition_signature`, `reaction` |

## Identity

**Attestation table:** composite PK `(user_id, parent_id)`.

**Ledger:** `UNIQUE(parent_id, nullifier)` — one active singleton per author per parent.

## Attributes

### NullifierAttestation (platform)

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `user_id` | UUID | yes | no | Account owner |
| `parent_id` | UUID | yes | yes | Root or attachment parent |
| `nullifier` | TEXT | yes | partial | Dedupe tag on envelope |
| `platform_sig` | TEXT | yes | no | Platform signature over nullifier |
| `membership_proof` | TEXT | no | no | ZK reserved (Method 4) |
| `created_at` | TIMESTAMPTZ | yes | no | |

### Envelope nullifier

Part of `txHash`, not `contentHash`. Present on singleton record types only.

## States & lifecycle

```
[user prepares singleton action]
        ▼
[platform issues nullifier attestation]
        ▼
[submit with nullifier on envelope]
        │
        ├─ vote update (if allowChange) → same nullifier, new content
        ├─ signature delete (if allowRevoke) → revoke op
        └─ reaction update → change kind (check ↔ cross)
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | |
| Vote | 1:1 active | One vote per user per poll |
| PetitionSignature | 1:1 active | One signature per user per petition |
| Reaction | 1:1 active | One reaction per user per target |
| ParticipantGeo | linkage | Nullifier → user → geocode for counts |

## Invariants

- Singleton types: `reaction`, `vote`, `petition_signature` ([types.ts](../../../public-record/src/schema/types.ts)).
- **UNIQUE(parent_id, nullifier)** prevents duplicate voting/signing.
- Nullifier root seeded once per user per jurisdiction at account-login passkey unlock (docs/08).
- `proof` slot on envelope reserved for ZK membership — rejected if present today.

## Permissions

| Action | Who |
|--------|-----|
| Issue | Platform at prepare step |
| Consume | User submit with valid platform sig |

## Events

- Prepare: nullifier attestation created.
- Submit: envelope nullifier checked against attestation + uniqueness constraint.

## Examples

**Valid:** User votes Yes on poll → nullifier N; later changes to No (if `allowChange`) → same N, `update` op.

**Invalid:** Second `create` vote on same poll by same user — rejected by nullifier uniqueness.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `nullifier_attestations` |
| Singleton rules | `public-record/src/schema/types.ts` → `SINGLETON_TYPES` |
| Prepare/submit | `api/src/services/civic-record.service.ts` |
| Geo linkage | `api/src/services/participant-geo.service.ts` |

## Gaps

- ZK membership proof (Method 4) reserved but unused.
