# PasskeyCredential

## Definition

An account-login WebAuthn credential that proves **who is logged in**. Distinct from [ThreadCredential](../civic-identity/thread-credential.md) (civic signing). Never signs the public record.

## Aliases

| Layer | Name |
|-------|------|
| Product | Account passkey / account-login passkey |
| Code | `PasskeyCredential`, `auth.passkey_credentials` |
| Glossary | Account-login passkey |

See [GLOSSARY.md](../../GLOSSARY.md) and [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md).

## Identity

Primary key: `auth.passkey_credentials.id` (UUID). WebAuthn `credential_id` is globally unique (base64url).

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | yes | HTTP view id |
| `user_id` | UUID | yes | no | Owner |
| `credential_id` | TEXT | yes | no | WebAuthn id |
| `public_key` | BYTEA | yes | **never** | COSE key bytes |
| `counter` | BIGINT | yes | no | Clone detection |
| `transports` | TEXT | no | yes | CSV e.g. "internal,hybrid" |
| `aaguid` | TEXT | no | no | Authenticator model |
| `label` | TEXT | no | yes | Human label |
| `created_at` | TIMESTAMPTZ | yes | yes | |
| `last_used_at` | TIMESTAMPTZ | no | yes | |

HTTP view (`PasskeyView`): `id`, `label`, `transports`, `createdAt`, `lastUsedAt` — no key material.

## States & lifecycle

```
[enrolled via WebAuthn register ceremony]
    │ used for login
    ▼
[active — may pair to sessions]
    │ revoked / removed
    ▼
[deleted — sessions credential_id SET NULL]
```

Multi-device: user may have several passkeys (one per device).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | |
| Session | 1:N | Optional `credential_id` pairing |
| Nullifier root | seeds | Account passkey unlock seeds nullifier root (docs/08) |

## Invariants

- **Never** signs public record — civic signing uses per-thread WebAuthn credentials.
- Distinct from civic `device_keys` (deprecated signing path).
- Revoking passkey revokes its paired sessions.
- Platform stores public key only.

## Permissions

| Action | Who |
|--------|-----|
| Enroll | Self (`full`, `recovery`, or `login` scope) |
| Login | Anyone with credential + challenge |
| List | Self |
| Revoke | Self (kick device) |

## Events

- Register ceremony: `webauthn_challenges` → credential insert.
- Login: counter increment, `last_used_at` update, session create.

## Examples

**Valid:** User adds second passkey from trusted device ("Add device") — additive, keeps other sessions.

**Invalid:** Using account passkey pubkey as envelope `signerPubkey` for a vote — wrong credential type.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/passkey.repo.ts` |
| Service | `api/src/services/passkey.service.ts` |
| Routes | `api/src/http/routes/passkey.routes.ts` |

## Gaps

None for MVP.
