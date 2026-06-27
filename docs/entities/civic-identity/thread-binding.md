# ThreadBinding

## Definition

Private platform registration binding that commits a [ThreadPersona](./thread-persona.md) public key to an opaque account commitment. Proves a per-thread key belongs to a verified account **without publishing which account**. Never published to the ledger.

## Aliases

| Layer | Name |
|-------|------|
| Code | `ThreadBinding`, `ThreadBindingRow`, `thread_bindings` |
| Commitment | `H(user_id, salt_t, thread_id, jurisdiction)` |

See [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md) and contributor §11.2.

## Identity

Primary key: `thread_bindings.thread_pubkey` → `thread_keys.pubkey`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `thread_pubkey` | TEXT | yes | no | PK → `thread_keys.pubkey` |
| `thread_id` | TEXT | yes | no | Root entity id |
| `jurisdiction` | TEXT | yes | no | Partition |
| `kyc_tier` | TEXT | no | no | Optional; tier applied at read time if absent |
| `commitment` | TEXT | yes | no | Opaque hex commitment |
| `binding_sig` | TEXT | yes | no | Platform P-256 signature |
| `created_at` | TIMESTAMPTZ | yes | no | |

`salt_t` (per-thread salt) is client-held today — not stored in binding row (KMS milestone).

## States & lifecycle

Created once at thread join. Immutable thereafter.

```
[joinThread]
        ▼
[binding created: platform signs commitment ↔ thread_pubkey]
        ▼
[used internally for ownership verification + settlement attestation]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| ThreadPersona | 1:1 | Same `thread_pubkey` |
| User | logical 1:1 | Via commitment opening (PII) |
| Verification | optional | `kyc_tier` nullable — tier from latest attestation at read time |

## Invariants

- Binding, salt, and commitment opening are **PII** — encrypted at rest, never published (contributor §11.2).
- Opaque commitment appears only in platform **settlement attestation metadata**, referenced by thread pubkey.
- Individual envelopes carry thread pubkey + signature + tier metadata — **never the commitment** (R7 area).
- `kyc_tier` on binding is optional; verification tier is applied at read/count time when absent.

## Permissions

| Action | Who |
|--------|-----|
| Create | Platform at thread join |
| Read | Platform internal only |
| Open commitment | User self-audit or authorized selective disclosure |

## Events

- Thread join: binding insert alongside `thread_keys`.
- Settlement: attestation metadata may reference commitment by pubkey.

## Examples

**Valid:** Binding with `kyc_tier: null` — ownership proven; current tier from `kyc_attestations` at count time.

**Invalid:** Publishing `commitment` or `user_id` on the public ledger or in API responses.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `thread_bindings` |
| Type | `public-record/src/private/store.ts` → `ThreadBindingRow` |
| Join | `api/src/services/civic-record.service.ts` → `IdentityRegistry.joinThread` |

## Gaps

- Salt escrow / at-rest encryption for commitment opening (KMS milestone).
- Selective disclosure UX (R11) partially specified, not fully shipped.
