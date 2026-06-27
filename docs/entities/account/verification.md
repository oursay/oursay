# Verification

## Definition

Proof that a user has completed identity and/or residency confirmation through a KYC provider. Represented as append-only attestations; the **latest row wins** for tier resolution. Matching is **set membership**, not a strict ladder.

## Aliases

| Layer | Name |
|-------|------|
| Product | Verification / KYC / verification tier |
| Code | `KycAttestation`, `KycTier`, `kyc_attestations` |
| States | See contributor §5.4 (includes flow states beyond tier enum) |

See [01-CONTRIBUTOR-SPEC.md §4–5](../../01-CONTRIBUTOR-SPEC.md) and [api/src/types/kyc.ts](../../../api/src/types/kyc.ts).

## Identity

Each attestation is uniquely identified by `kyc_attestations.id` (UUID). A user's **effective tier** is the `tier` on the latest row by `attested_at`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | Attestation id |
| `user_id` | UUID | yes | no | FK → `users.id` |
| `provider` | TEXT | yes | partial | `'stub'` \| `'equifax'` |
| `tier` | `KycTier` | yes | partial | Tier slug only on public surfaces |
| `region` | TEXT | no | no | Coarse provider region |
| `attested_at` | TIMESTAMPTZ | yes | no | Ordering key |

### KycTier enum

| Tier | Meaning |
|------|---------|
| `unverified` | Floor — no attestation or unrecognized value |
| `identity_verified` | Name + age 18+ confirmed |
| `residency_verified` | Identity + address confirmed |
| `electoral_validated` | Electoral authority confirmation (future) |

Provider output mapping (contributor §5.2):

| Provider output | Tier awarded |
|-----------------|--------------|
| Identity confirmed | `identity_verified` |
| Identity + address | `residency_verified` |
| Public official status | `official_verified`* |
| Electoral authority | `electoral_validated` |

\* `official_verified` is in contributor spec but not yet in `KYC_TIERS` enum — future alignment needed.

### Account verification states (contributor §5.4)

Flow states beyond the tier enum: `pending`, `failed`, `sponsored_pending`, `verification_not_completed`. These are product/account states, not separate DB entities today.

## States & lifecycle

```
[unverified]
    │ initiate KYC + consent to cost
    ▼
[pending]
    ├─ pass → append attestation (identity_verified or residency_verified)
    └─ fail → failed (no ledger record)
```

Sponsorship path: `sponsored_pending` → must complete within 30 days or `verification_not_completed`.

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | Many attestations over time |
| ThreadBinding | optional | Tier applied at read/count time, not fixed at join |
| Public record | indirect | Verified actions on-ledger; tier in metadata |

## Invariants

- Tier matching is **set membership**, not ordering — no rank table ([kyc.ts](../../../api/src/types/kyc.ts)).
- **Residency verification ≠ electoral eligibility** (contributor §4.4).
- On pass: public-record entry links pseudonymous identity to tier — **no PII on ledger** (contributor §5.3).
- On fail: no ledger record created.
- User must see exact at-cost price and consent before payment (contributor §5.5).

## Permissions

| Action | Who |
|--------|-----|
| Initiate | Self (full session) |
| Attest | KYC provider abstraction only |
| Read tier | Self; public surfaces show tier label only |
| Dev attest | `POST /v1/dev/kyc/attest` (dev only) |

## Events

- Pass: append `kyc_attestations` row; may trigger thread binding tier refresh at read time.
- Fail: notification to user; no attestation row (or failed state at account level — future).

## Examples

**Valid:** Equifax returns identity + address → `residency_verified` attestation appended; user's verified petition signature goes on-ledger.

**Invalid:** Treating `identity_verified` as automatically including `residency_verified` in tier filters — they are distinct set members.

## Implementation

| Layer | Path |
|-------|------|
| Tier enum | `api/src/types/kyc.ts` |
| Repo | `api/src/repo/kyc.repo.ts` |
| Service | `api/src/services/kyc.service.ts` |
| Provider seam | `api/src/services/kyc/provider.ts` |
| Dev route | `api/src/http/routes/kyc-dev.routes.ts` |

## Gaps

- **[mvp-c-kyc-provider]**: Production Equifax (etc.) not implemented; dev stub only.
- Recovery re-verify flow incomplete.
- `official_verified` tier not in canonical enum yet.
- Sponsorship / waitlist mechanics documented in contributor spec but not fully implemented.
