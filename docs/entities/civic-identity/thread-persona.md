# ThreadPersona

## Definition

The stable pseudonymous public identity **Pₜ** for a user within one civic thread (a belief, petition, or public vote root). Appears as `authorPubkey` on every envelope that user writes in that thread — identical across all their devices. One persona per `(user, thread)`; first device wins at join.

## Aliases

| Layer | Name |
|-------|------|
| Product | Thread key / thread persona / pseudonym |
| Code | `ThreadKey`, Pₜ, `thread_keys` |
| Envelope field | `authorPubkey` |

See [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md) §2–3.

## Identity

Primary key: `thread_keys.id` (UUID). Uniqueness enforced on `(user_id, thread_id)` and `pubkey` (hex, compressed P-256).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | Internal id |
| `user_id` | UUID | yes | no | FK → `users.id` |
| `thread_id` | TEXT | yes | yes | Root entity id (post/petition/poll) |
| `jurisdiction` | TEXT | yes | yes | Partition key |
| `pubkey` | TEXT | yes | yes | Pₜ hex — public author on record |
| `claimed` | BOOLEAN | yes | yes | User publicly claimed thread (future R8) |
| `claimed_at` | TIMESTAMPTZ | no | yes | Claim timestamp (future R9) |

## States & lifecycle

```
[user joins thread]
        │ IdentityRegistry.joinThread
        ▼
[thread_keys row created — first-wins on (user, thread)]
        │
        ▼
[all devices share same Pₜ as authorPubkey]
        │ optional future
        ▼
[claimed = true — links pseudonym to public profile]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | Owner |
| ThreadBinding | 1:1 | Private platform binding to account |
| ThreadCredential | 1:N | Per-device signers for this persona |
| RecordTransaction | 1:N | All txs use this `authorPubkey` |
| JurisdictionMasterKey | N:1 | Derived from jurisdiction-scoped master |

## Invariants

- **R2 [Invariant]**: Every ledger entry signed by per-thread key ([REQUIREMENTS.md](../../../public-record/REQUIREMENTS.md)).
- **R3 [Invariant]**: Keys derived on-device from jurisdiction-scoped master via HKDF.
- **UNIQUE(user_id, thread_id)**: First device wins Pₜ at DB level.
- Per-thread pubkey reveals nothing about real-world identity (contributor §11.2).
- Platform never holds private keys ([08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md)).

## Permissions

| Action | Who |
|--------|-----|
| Create (join) | Authenticated user on first civic action in thread |
| Read pubkey | Public on record envelopes |
| Claim | Self (future) |

## Events

- Join thread: creates `thread_keys` + `thread_bindings` + first `thread_civic_credentials`.
- Civic write: envelope carries Pₜ as `authorPubkey`.

## Examples

**Valid:** User joins poll thread on phone → Pₜ created; later joins same thread on laptop → same Pₜ, new device signer credential.

**Invalid:** Two different Pₜ values for same `(user_id, thread_id)` — DB constraint prevents.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `thread_keys` |
| Repo | `api/src/repo/civic-device.repo.ts` |
| Join flow | `api/src/services/civic-record.service.ts` |
| Types | `identity/src/shared/types.ts` → `ThreadRegistration` |

## Gaps

- Public thread claim flow (R8/R9) not implemented — `claimed` columns exist.
