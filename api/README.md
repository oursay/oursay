# @oursay/api

Account **registration & authentication** for OurSay — an OpenAPI-first Fastify service over a
layered, testable core.

- **Email OTP** — bootstrap (registration) and recovery only.
- **WebAuthn passkeys** — the day-to-day login after enrollment (`@simplewebauthn/server`).
- **Opaque DB-backed sessions** — server-side revocation; Bearer token **or** HttpOnly cookie.
- **Private profile/PII** — generic address components + a free `memo`; the front-end localizes
  labels. No per-user region/riding binding is stored.

> **Account login ≠ civic signing.** The WebAuthn passkey here proves *who is logged in*
> (docs/08 §2). It is **not** the per-thread civic signing key (`device_keys` / `thread_signers`
> in `@oursay/public-record`). Wiring the civic write routes over HTTP is a later milestone.

## Architecture

Services are the durable core — callable from HTTP, the CLI, and tests alike:

```
helpers/   pure utilities (otp, tokens, age gate, email/address normalization, webauthn)
   ↓
repo/      data access only (parametrized SQL; no business rules)
   ↓
services/  business logic (Otp, Registration, Passkey, Auth, Recovery, Mailer) — plain DTO in/out
   ↓
http/      thin Fastify routes (parse → authorize → call service → map errors)
```

The service graph is assembled in `src/container.ts` (`buildServices(db)`); `src/http/server.ts`
(`buildServer(services)`) is one consumer.

## Data model

`@oursay/api` shares `@oursay/public-record`'s Postgres database and adds its own **`auth` schema**,
FK'd to `public.users`:

| Table | Purpose |
|-------|---------|
| `public.users` | shared account row; `handle` is the display name (single source of truth) |
| `auth.profiles` | private PII (generic address + `memo`, birthdate, email + canonical) |
| `auth.passkey_credentials` | **account-login** WebAuthn credentials (not civic signers) |
| `auth.webauthn_challenges` | short-lived register/login ceremony challenges |
| `auth.sessions` | opaque sessions (only token hashes stored) |
| `auth.email_otp` | hashed OTP codes |
| `auth.otp_rate_limits` | rolling-window rate-limit buckets |

Init order matters: `public.*` must exist before the `auth` schema FKs it. `Db.init()` applies
`PrivateStore`'s base schema first, then `auth`.

## Flows

- **Register** — `POST /v1/auth/otp/request` → `{ status: "sent", expiresAt }` (UTC deadline) → email code → `POST /v1/auth/otp/verify` with the
  profile body → account + full session. Age gate (18+) is enforced in `RegistrationService`.
  `otp/request` returns **409 `email_taken`** if the address is already registered (sign in / recover
  instead — no wasted code). On verify, `RegistrationService` validates everything *before* consuming
  the OTP — profile → `email_taken` → age gate → **then** verify the code — so a 409/403 never burns a
  valid code (the user can correct the profile and retry the same code).
- **Enroll passkey** — authenticated → `POST /v1/auth/passkey/register/{options,verify}`.
- **Login** — passkey only: `POST /v1/auth/passkey/login/{options,verify}` → session.
- **Recover** — `POST /v1/auth/recovery/request` → code → `POST /v1/auth/recovery/verify`. Branch on
  `public.kyc_attestations`: unverified → limited recovery session to re-enroll a passkey; verified →
  KYC re-verification required (policy stub, provider not integrated).

## Dev cycle

```bash
# 1. Shared Postgres (also brings up immudb for public-record). Ensures public.* schema exists.
npm run db:up -w @oursay/public-record       # or: npm run db:up -w @oursay/api (delegates)

# 2. Run the API (Swagger UI at http://localhost:8080/docs, spec at /openapi.json)
cp api/.env.example api/.env                 # optional; dev defaults work out of the box
npm run dev -w @oursay/api

# 3. Tests (integration; need the DB from step 1)
npm test -w @oursay/api

# 4. Regenerate the committed human-readable spec after changing routes
npm run openapi:dump -w @oursay/api          # writes api/openapi.yaml
```

`npm run db:down` wipes Docker volumes — **destructive, dev-only**. The test reset and `db:down` are
guarded by `scripts/destructive-guard.ts` and refuse to run under `NODE_ENV=production`.

## CLI

Admin/dev commands that call the same services (no HTTP):

```bash
npm run cli -w @oursay/api -- send-test-otp you@example.com
npm run cli -w @oursay/api -- list-sessions <userId>
npm run cli -w @oursay/api -- expire-sessions <userId>
npm run cli -w @oursay/api -- create-user "Jane" jane@example.com 1990-01-01
```

## Configuration

See [`.env.example`](./.env.example). Notable keys: `SESSION_SECRET` (required in production),
`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`, OTP TTL + rate limits, `MIN_AGE_YEARS`, and per-role mailer
vendor lists (`MAILER_REGISTRATION_VENDORS` / `MAILER_RECOVERY_VENDORS`). PII is never logged; OTP
codes are never logged or returned.

## Tests

`mocha` integration specs against Docker Postgres (`test/`). The passkey suite drives the **real**
`@simplewebauthn/server` with a software authenticator (`test/fixtures/webauthn/`) — no browser
needed in CI. The dev `noop` mailer records messages in memory so tests can read the emailed code.

When `MAILER_*_VENDORS=noop` and `NODE_ENV` is not `production`, the API **prints OTP codes to the
dev server console** (`[mailer:noop:dev] OTP for …`) so manual Swagger walks work without Postmark.
Production never logs codes.

## Not in this milestone

Civic IdentityRegistry write routes over HTTP, full KYC provider integration, Method-4 ZK,
production KMS / encryption-at-rest (schema hooks only), and the browser passkey UX.
