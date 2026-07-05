# Verification

## Definition

Proof that a user has completed identity and/or residency confirmation through a KYC provider. Represented as append-only attestations; the **latest row wins** for tier resolution. Matching is **set membership**, not a strict ladder.

**The KYC step is where identity PII is verified.** Registration is least-resistance (email + required handle + over_18 checkbox; display name, full name, and address are optional at signup, behind a helper noting they must be filled before ID/residency verification); whatever was left blank is entered at the start of verification and stored on [Profile](./profile.md) — the first address write (signup or here) triggers the geocode sync.

**Tiers and provider tags are orthogonal.** A *tier* says how verified an account is; a *provider tag* says who attested it (and how). The MVP provider is **Didit**:
- **Dev:** ID-only verification (free) + a **platform self-signed** address KYC (POA-ready).
- **Prod:** Didit performs proof-of-address (POA) verification, charged at ~$2 CAD/check.

Equifax (canadian_verified) and Elections Alberta (electoral_verified) provider tags are **future only**. Residency verification is **never** electoral eligibility, and OurSay must **never** imply an Elections Alberta partnership.

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
| `provider` | TEXT | yes | partial | `'stub'` \| `'didit'` (MVP); `'equifax'`/electoral = future tags |
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

| Provider output | Awarded |
|-----------------|--------------|
| Identity confirmed | `identity_verified` |
| Identity + address | `residency_verified` |
| Public official status | the **`official` role** — platform-assigned and revocable, **not a tier** (see below) |
| Electoral authority | `electoral_validated` |

**Official is a role, not a tier.** Authority (a seated MLA, an agency) is a platform-assigned,
revocable **role** attached to the user/jurisdiction membership, used by role-gated actions (e.g.
`ab-ca-gov` poll creation). Tiers stay pure KYC facts; the earlier `official_verified` tier idea is
retired.

**Obtaining the official role:** the platform **manually validates** the person — identity verification at minimum, residency preferred though not technically required (an official may live outside the district they represent, so in-district filter logic is **forced to the represented district**, never the home address/geopoint). `identity_verified` (min) + the official role together form the composite **official verification** status. Keep the suffixes distinct everywhere: **official role** (authority), **official verification** (role + KYC composite), **official count** (the counting floor on totals — nothing to do with the role, except that in `ab-ca-gov` role holders are excluded from voting and petition signing).

### Account verification states (contributor §5.4)

Flow states beyond the tier enum: `pending`, `failed`, `sponsored_pending`, `verification_not_completed`. These are product/account states, not separate DB entities today.

## States & lifecycle

```
[unverified]
    │ initiate KYC — enter legal name/address (first PII write) + consent to cost
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

**Valid:** Didit returns identity confirmed → `identity_verified` attestation appended; the platform self-signs the address check → `residency_verified`; the user's verified petition signature goes on-ledger.

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

- **Provider drift** — the provider enum today is `'stub' | 'equifax'` (`api/src/config.ts` `KycProviderName`). The MVP provider is **Didit**; the enum and provider seam need a `didit` implementation, and provider tags should be orthogonal to tiers. Tracked as `[code-didit-provider]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->
- **[mvp-c-kyc-provider]**: Production provider not implemented; dev stub only.
- Recovery re-verify flow incomplete.
- **Official role storage** — the platform-assigned `official` role (role, not tier) has no column/assignment flow yet — `[align-w3-gates-schema]`.
- **Jurisdiction-residency gate** — `residency_verified` AND point-in-jurisdiction (the `ab-ca-gov` vote act / official-count gate) needs a resolver combining the tier attestation with `ParticipantGeoService` containment; not built.
- Sponsorship / waitlist mechanics documented in contributor spec but not fully implemented.
- Equifax / electoral-roll provider tags — future only ([account/future.md](./future.md)).
