# EmailOtp

## Definition

A one-time email verification code for the three account bootstrap flows: registration, recovery, and gated cross-device login. Plaintext code is never stored — only hashed with per-row salt.

## Aliases

| Layer | Name |
|-------|------|
| Code | `EmailOtp`, `auth.email_otp` |
| Purpose | `OtpPurpose` |

See [GLOSSARY.md](../../GLOSSARY.md) OTP purpose vocabulary.

## Identity

Primary key: `auth.email_otp.id` (UUID). Active OTP: `consumed_at IS NULL` AND `expires_at > now()`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | |
| `email_canonical` | TEXT | yes | no | Normalized email |
| `code_hash` | TEXT | yes | no | Pepper + salt hash |
| `salt` | TEXT | yes | no | Per-row salt |
| `purpose` | OtpPurpose | yes | no | Flow discriminator |
| `attempts` | INT | yes | no | Brute-force counter |
| `expires_at` | TIMESTAMPTZ | yes | no | TTL bound |
| `consumed_at` | TIMESTAMPTZ | no | no | One-time use |
| `created_at` | TIMESTAMPTZ | yes | no | |

### OtpPurpose

| Purpose | Flow |
|---------|------|
| `registration` | First-time account bootstrap |
| `recovery` | Lost passkey — yields `recovery` session |
| `login` | Gated cross-device sign-in — yields `login` session |

All codes requested via `POST /v1/auth/otp/request`. Email OTP is **never a standing login method** — only these three purposes.

## States & lifecycle

```
[requested — active OTP]
    │ verify success
    ▼
[consumed]
    │ OR expiry / max attempts
    ▼
[invalid]
```

Login purpose: active `login` OTP row **is** the login enable window (TTL = `OTP_TTL_SEC`).

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | logical | Via `email_canonical` at verify time |
| Session | 1:1 on success | Created after verify |
| OtpRateLimit | N:1 | Rate limit buckets |

## Invariants

- Plaintext code never persisted or logged.
- Consumed once per successful verify.
- `login` OTP requests are silent no-ops when enable window closed.
- Rate limiting via `auth.otp_rate_limits`.

## Permissions

| Action | Who |
|--------|-----|
| Request | Unauthenticated (registration) or authenticated (login enable) |
| Verify | Holder of email + code |

## Events

- Request → email sent via mailer (`MailRole` matches purpose).
- Verify → session created, OTP consumed.

## Examples

**Valid:** Registration OTP verified → user + profile created → `full` session.

**Invalid:** Using OTP as ongoing authentication without enrolling passkey — OTP is bootstrap only.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/otp.repo.ts` |
| Service | `api/src/services/otp.service.ts` |
| Rate limit | `api/src/repo/ratelimit.repo.ts` |
| Routes | `registration.routes.ts`, `recovery.routes.ts`, `login.routes.ts`, `otp.routes.ts` |

## Gaps

None for MVP account flows.
