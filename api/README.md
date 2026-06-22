# @oursay/api

Account **registration & authentication** for OurSay — an OpenAPI-first Fastify service over a
layered, testable core.

- **WebAuthn passkeys** — the preferred, day-to-day login (`@simplewebauthn/server`).
  **Multi-device**: a user may enroll several account-login passkeys (one per device).
- **Email OTP** — never a standing login method. It serves exactly three **purposes**, all sent
  through one request endpoint (`POST /v1/auth/otp/request`, `purpose` discriminator):
  - `registration` — first-time bootstrap → **full** session.
  - `recovery` — lost passkey → limited **recovery** session; **revokes all prior sessions**.
  - `login` — **gated** cross-device sign-in: only sent after a trusted device opens the window;
    yields a limited **login** (enroll-only) session.
- **Opaque DB-backed sessions** — server-side revocation; Bearer token **or** HttpOnly cookie.
  Scope `full` vs the limited `recovery` / `login` scopes (passkey-enroll only).
- **Civic device keys** — authenticated enrollment/listing/revocation of public-record signing keys
  (`/v1/civic/devices`), public key only.
- **Private profile/PII** — generic address components + a free `memo`; the front-end localizes
  labels. No per-user region/riding binding is stored.

> **Account login ≠ civic signing.** The WebAuthn passkey here proves *who is logged in*
> (docs/08 §2). It is **not** the per-thread civic signing key (`device_keys` / `thread_signers`
> in `@oursay/public-record`). The `/v1/civic/devices` routes register the **public** civic device
> key after login; private keys never reach the platform.

## Architecture

Services are the durable core — callable from HTTP, the CLI, and tests alike:

```
helpers/   pure utilities (otp, tokens, age gate, email/address normalization, webauthn)
   ↓
repo/      data access only (parametrized SQL; no business rules)
   ↓
services/  business logic (Otp, Registration, Passkey, Auth, Recovery, Login, CivicDevice, Mailer)
   ↓
http/      thin Fastify routes (parse → authorize → call service → map errors)
```

The service graph is assembled in `src/container.ts` (`buildServices(db)`); `src/http/server.ts`
(`buildServer(services)`) is one consumer.

## Data model

`@oursay/api` shares [`@oursay/public-record`](../public-record/README.md)'s Postgres database and
adds its own **`auth` schema**, FK'd to `public.users`:

| Table | Purpose |
|-------|---------|
| `public.users` | shared account row; `handle` is the display name (single source of truth) |
| `auth.profiles` | private PII (generic address + `memo`, birthdate, email + canonical) |
| `auth.passkey_credentials` | **account-login** WebAuthn credentials (not civic signers) |
| `auth.webauthn_challenges` | short-lived register/login ceremony challenges |
| `auth.sessions` | opaque sessions (only token hashes stored) |
| `auth.email_otp` | hashed OTP codes; `purpose` ∈ {registration, recovery, login} — an active `login` row IS the gated-login window |
| `auth.otp_rate_limits` | rolling-window rate-limit buckets |
| `public.device_keys` | **civic** signing device keys (owned by public-record; read/written by `/v1/civic/devices`) — public key only, separate from `auth.passkey_credentials` |

Init order matters: `public.*` must exist before the `auth` schema FKs it. `Db.init()` applies
`PrivateStore`'s base schema first, then `auth`.

## Flows

- **Register** — `POST /v1/auth/otp/request` → `{ status: "sent", expiresAt }` (UTC deadline) → email code → `POST /v1/auth/otp/verify` with the
  profile body → account + full session. Age gate (18+) is enforced in `RegistrationService`.
  `otp/request` returns **409 `email_taken`** if the address is already registered (sign in / recover
  instead — no wasted code). On verify, `RegistrationService` validates everything *before* consuming
  the OTP — profile → `email_taken` → age gate → **then** verify the code — so a 409/403 never burns a
  valid code (the user can correct the profile and retry the same code).
- **Enroll passkey / add device** — authenticated → `POST /v1/auth/passkey/register/{options,verify}`.
  Run it again from a trusted device to enroll an **additional** passkey (multi-device); each
  credential is independent and the platform stores public metadata only.
- **List / revoke passkeys (manage devices)** — full session → `GET /v1/auth/passkeys` lists the
  caller's enrolled passkeys (metadata only, no key material); `POST /v1/auth/passkey/revoke {id}`
  removes one ("kick a compromised/retired device"), owner-scoped (404 if it isn't yours). Revoking
  the **last** passkey is refused (403) to avoid lockout — use recovery instead.
- **Login** — passkey only: `POST /v1/auth/passkey/login/{options,verify}` → full session.
- **Civic device key** — after login, `POST /v1/civic/devices` (public key only), `GET /v1/civic/devices`,
  `POST /v1/civic/devices/revoke`. Separate from login passkeys; signs public-record actions on-device.
- **Gated cross-device login** — for signing in on a *new* device (docs/08). From a trusted device
  (full session **+** an enrolled passkey) `POST /v1/auth/login/enable` opens a short-lived window and
  emails a `login` code. The new device redeems it at `POST /v1/auth/login/verify` → a limited
  **`login`** (enroll-only) session; it enrolls a passkey, then logs in with it for full access. A
  bare `login` code never works without an open window (no enumeration). Unlike recovery, login is
  **additive — it does not revoke other sessions**. `POST /v1/auth/otp/request {purpose:"login"}` is
  the (re)send path, gated on the open window.
- **Recover** — `POST /v1/auth/otp/request {purpose:"recovery"}` → code → `POST /v1/auth/recovery/verify`.
  Branch on `public.kyc_attestations`: unverified → limited recovery session to re-enroll a passkey;
  verified → KYC re-verification required (policy stub, provider not integrated). On success, recovery
  **revokes all prior sessions** before issuing the recovery-scoped one.

> **Add device vs recovery** — both end in a new passkey, but they differ: *add device / gated login*
> is **additive** (the user still has access elsewhere; other sessions are kept), while *recovery*
> assumes **lost access** (it revokes every prior session as a security reset).

**UX note — profile before OTP.** The display name, birthdate, and address are collected *first* and
submitted *together with* the OTP at `otp/verify`; the code only proves the email and never carries
profile data. **Incomplete onboarding** (email registered but no passkey enrolled — e.g. the user
dropped off after step 3, or lost the only device) is resolved through **recovery**: request a
recovery code, get a recovery-scoped session, and enroll/re-enroll a passkey. There is no password to
fall back on by design.

## Dev cycle

```bash
# 1. Shared Postgres (also brings up immudb for public-record). Ensures public.* schema exists.
npm run db:up -w @oursay/public-record       # or: npm run db:up -w @oursay/api (delegates)

# 2. Run the API (Swagger UI at http://localhost:8080/docs, spec at /openapi.json,
#    dev walk harness at http://localhost:8080/walk)
cp api/.env.example api/.env                 # optional; dev defaults work out of the box
npm run dev -w @oursay/api

# 3. Tests (integration; need the DB from step 1)
npm test -w @oursay/api

# 4. Regenerate the committed human-readable spec after changing routes
npm run openapi:dump -w @oursay/api          # writes api/openapi.yaml
```

`npm run db:down` wipes Docker volumes — **destructive, dev-only**. The test reset and `db:down` are
guarded by `scripts/destructive-guard.ts` and refuse to run under `NODE_ENV=production`.

## Dev walk (`/walk`)

WebAuthn ceremonies can't run inside Swagger, so the dev server also serves a **same-origin walk
harness** at [`/walk`](http://localhost:8080/walk) — a thin HTML page (`api/web/walktest/`) that
clicks through the whole account flow against the real `/v1` routes. It is registered **only when
`NODE_ENV != production`** and is not a production surface.

Walk it on a browser with a platform authenticator (Touch ID / Windows Hello):

1. **Profile** — fill display name, DOB (18+), address (kept client-side).
2. **Request OTP** — sends a registration code; the code prints to the **API server console**
   (`[mailer:noop:dev] OTP for …`) — the page can't read your inbox.
3. **Verify** — submits the code + profile → account + full session (cookie + Bearer shown).
4. **Enroll passkey** → 5. **Enroll civic device key** (WebCrypto P-256; public key only) →
   6. **Logout** → 7. **Passkey login** (usernameless) → reads `/v1/profile`.
8. **Sign in on another device** — from the authenticated session, enable cross-device login (sends a
   `login` code), then *simulate the new device*: verify the code → enroll-only session → enroll a
   passkey → log in for full access.
9. **Recovery** — email code (unified request, `purpose:recovery`) → recovery-scoped session →
   re-enroll a passkey (the "lost passkey" path; contrast with step 8).

Sessions use the HttpOnly cookie (`credentials: include`); the page also displays the Bearer token so
you can paste it into `/docs` → Authorize for manual API calls.

## CLI

Admin/dev commands that call the same services (no HTTP):

```bash
npm run cli -w @oursay/api -- send-test-otp you@example.com [registration|recovery|login]
npm run cli -w @oursay/api -- enable-login <userId>      # open a gated cross-device login window
npm run cli -w @oursay/api -- list-sessions <userId>
npm run cli -w @oursay/api -- expire-sessions <userId>
npm run cli -w @oursay/api -- create-user "Jane" jane@example.com 1990-01-01
```

> **Dev-only caveat:** `send-test-otp … login` calls the OTP service directly, so it **bypasses the
> trusted-device enable-window gate** that the HTTP/login service enforces. It is a local convenience
> for reading a code off the dev mailer, **not** production behavior — a real new device only gets a
> login code after `enable-login` (or `POST /v1/auth/login/enable`) opens the window.

## Configuration

See [`.env.example`](./.env.example). Notable keys: `SESSION_SECRET` (required in production),
`WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`, OTP TTL + rate limits (`OTP_TTL_SEC` also bounds the gated-login
window), `MIN_AGE_YEARS`, and per-role mailer vendor lists (`MAILER_REGISTRATION_VENDORS` /
`MAILER_RECOVERY_VENDORS` / `MAILER_LOGIN_VENDORS`). PII is never logged; OTP codes are never logged
or returned.

## Tests

`mocha` integration specs against Docker Postgres (`test/`). The passkey suite drives the **real**
`@simplewebauthn/server` with a software authenticator (`test/fixtures/webauthn/`) — no browser
needed in CI. The dev `noop` mailer records messages in memory so tests can read the emailed code.

When `MAILER_*_VENDORS=noop` and `NODE_ENV` is not `production`, the API **prints OTP codes to the
dev server console** (`[mailer:noop:dev] OTP for …`) so manual Swagger/`/walk` walks work without
Postmark. Production never logs codes.

## Future auth UX

Beyond the current passkey-primary flow, a planned addition is **cross-device QR login**: an
already-authenticated device displays a QR code that a new device scans to bootstrap a session
(approved on the trusted device), avoiding email-OTP round-trips when adding a device. This is
direction only — not implemented or scoped here, and orthogonal to the civic thread-signing keys in
`@oursay/public-record`.

## Not in this milestone

Civic IdentityRegistry **thread-join / signed-submission** write routes over HTTP (only device-key
enrollment is exposed), production WebAuthn PRF / non-exportable browser signing for civic keys, full
KYC provider integration, Method-4 ZK, and production KMS / encryption-at-rest (schema hooks only).
