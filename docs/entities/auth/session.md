# Session

## Definition

An opaque, database-backed login session proving an authenticated user. The token itself is never stored — only its hash. Scope determines what the session may do.

## Aliases

| Layer | Name |
|-------|------|
| Code | `Session`, `auth.sessions` |
| Scope | `SessionScope` |

Supporting object — not civic domain, but required for account access. See [GLOSSARY.md](../../GLOSSARY.md) and [08-IDENTITY-AND-DEVICE-POLICY.md](../../08-IDENTITY-AND-DEVICE-POLICY.md).

## Identity

Primary key: `auth.sessions.id` (UUID). Active session: `revoked_at IS NULL` AND `expires_at > now()`.

## Attributes

| Field | Type | Required | Public | Source |
|-------|------|----------|--------|--------|
| `id` | UUID | yes | no | |
| `user_id` | UUID | yes | no | FK → `users.id` |
| `token_hash` | TEXT | yes | no | Unique; token never stored |
| `scope` | SessionScope | yes | no | Access level |
| `credential_id` | UUID | no | no | Passkey that established session |
| `user_agent` | TEXT | no | no | |
| `created_at` | TIMESTAMPTZ | yes | no | |
| `expires_at` | TIMESTAMPTZ | yes | no | |
| `revoked_at` | TIMESTAMPTZ | no | no | |

### SessionScope

| Scope | Meaning |
|-------|---------|
| `full` | Complete account access |
| `registration` | **Target** — issued by OTP registration; may enroll the **first** passkey only. A `full` session is issued only after the user then logs in with that passkey. (See Gaps — today registration issues `full` directly.) |
| `recovery` | Enroll passkey only; **revokes all prior sessions** |
| `login` | Gated cross-device login; enroll-only; does **not** revoke others |

## States & lifecycle

```
[created — active]
    │ expiry OR revoke OR recovery (revokes all)
    ▼
[revoked / expired]
```

## Relationships

| Related | Cardinality | Notes |
|---------|-------------|-------|
| User | N:1 | |
| PasskeyCredential | N:1 optional | Paired on passkey login |

## Invariants

- Token plaintext never persisted.
- Recovery scope revokes all prior sessions; login scope does not.
- Limited scopes may **only** enroll a passkey — not full civic actions until `full` session.

## Permissions

| Action | Who |
|--------|-----|
| Create | Auth flows (register, passkey login, OTP) |
| Revoke | User (logout), recovery flow, passkey kick |
| Use | Bearer of valid token |

## Events

- Passkey login → `full` session with optional `credential_id`.
- Recovery OTP → `recovery` session, revokes others.
- Gated login OTP → `login` session.

## Examples

**Valid:** `full` session after passkey login — can access profile and civic prepare/submit.

**Invalid:** Using `recovery` session to cast a vote — scope too limited.

## Implementation

| Layer | Path |
|-------|------|
| DDL | `api/src/schema/auth.sql.ts` |
| Repo | `api/src/repo/session.repo.ts` |
| Service | `api/src/services/auth.service.ts` |
| HTTP schema | `api/src/http/schemas.ts` → `sessionSchema` |

## Gaps

- **Registration scope drift** — `RegistrationService` issues a `full` session directly (`api/src/services/registration.service.ts`), so a freshly registered account can perform full civic actions before enrolling a passkey. Target: issue a limited `registration` scope (enroll first passkey only), then `full` after passkey login. Tracked in `.agents/CODE-ALIGNMENT-PROMPTS.md` → `[code-registration-scope]`; see [auth/future.md](./future.md).
