# ThreadCredential

## Definition

Per-device WebAuthn signing credential for civic actions in a thread. Each device's passkey pubkey is the envelope's **`signerPubkey`**; assertions are verified against it, not against Pₜ ([ThreadPersona](./thread-persona.md)). One credential per `(device, thread)`.

## Aliases

| Layer | Name |
|-------|------|
| Product | Civic signer / per-thread passkey |
| Code | `ThreadCivicCredential`, `thread_civic_credentials` |
| Envelope fields | `signerPubkey`, `signScheme: "webauthn-es256"`, `webauthn` assertion |

Distinct from [PasskeyCredential](../auth/passkey-credential.md) (account login).

See [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md) §5.4.

## Identity

Primary key: `thread_civic_credentials.credential_pubkey` (= envelope `signerPubkey`, hex).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `credential_pubkey` | TEXT | yes | yes | On envelope as `signerPubkey` |
| `persona_pubkey` | TEXT | yes | yes | FK → `thread_keys.pubkey` (Pₜ) |
| `user_id` | UUID | yes | no | Owner |
| `thread_id` | TEXT | yes | yes | Root entity |
| `jurisdiction` | TEXT | yes | yes | Partition |
| `credential_sig` | TEXT | yes | no | Enrollment signature |
| `created_at` | TIMESTAMPTZ | yes | no | |
| `revoked_at` | TIMESTAMPTZ | no | no | Lost/retired device |

## States & lifecycle

```
[joinThread on device]
        ▼
[WebAuthn credential created for (device, thread)]
        ▼
[active — revoked_at IS NULL]
        │ device lost
        ▼
[revoked_at set — may no longer sign]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| ThreadPersona | N:1 | All credentials share one Pₜ per user+thread |
| User | N:1 | |
| RecordTransaction | 1:N | Each append verified against `signerPubkey` |

## Invariants

- **R2**: Every envelope signed on device before server accept.
- `vote` and `petition_signature` **MUST** use `webauthn-es256` (user-verifying assertion per action).
- Assertion challenge MUST equal signing digest of envelope; UV flag MUST be set.
- `authorPubkey` = Pₜ (stable); `signerPubkey` = this device's passkey (required for WebAuthn path).
- Platform never holds private keys.

## Permissions

| Action | Who |
|--------|-----|
| Enroll | Authenticated user at thread join on device |
| Sign | Device holder — fresh assertion per civic append |
| Revoke | Self (lost device flow) |

## Events

- Join: credential row + binding.
- Submit: server verifies WebAuthn assertion against `signerPubkey`.

## Examples

**Valid:** User casts vote with `signScheme: "webauthn-es256"`, `authorPubkey: Pₜ`, `signerPubkey: device_passkey`, populated `webauthn` assertion.

**Invalid:** Vote signed with `p256` software key only — rejected for `vote` type.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `public-record/src/schema/postgres.sql.ts` → `thread_civic_credentials` |
| Sign scheme policy | `public-record/src/jurisdiction.ts` → `requiredSignScheme()` |
| Types | `public-record/src/schema/types.ts` → `SignScheme`, `WebauthnAssertion` |
| Civic routes | `api/src/http/routes/civic-record.routes.ts` |

## Gaps

- Legacy `p256` / `device_keys` / `thread_signers` path deprecated but still in schema for dual-verifier period.
