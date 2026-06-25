# @oursay/api

Account **registration & authentication** for OurSay — an OpenAPI-first Fastify service over a
layered, testable core.

For **what is implemented vs stubbed** and the pre-UI backend backlog, see
[`docs/API-GAPS-AND-ROADMAP.md`](../docs/API-GAPS-AND-ROADMAP.md). Geographic filtering vocabulary:
[`docs/REGION-MODEL.md`](../docs/REGION-MODEL.md).

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
| `auth.profile_geocodes` | **private** geocode point cache — CURRENT point per user (PostGIS `Point`); never on any HTTP response |
| `auth.profile_geocode_history` | **append-only** audit of every distinct address→point a user resolved to (future "ever in region" filters) |
| `public.device_keys` | **civic** signing device keys (owned by public-record; read/written by `/v1/civic/devices`) — public key only, separate from `auth.passkey_credentials` |

Init order matters: `public.*` must exist before the `auth` schema FKs it, and the geocode tables need
PostGIS. `Db.init()` applies `PrivateStore`'s base schema first, then the `geo` schema (which enables the
PostGIS extension), then `auth`.

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
  - **What revoke does:** (1) the credential row is **deleted** — that passkey can no longer log in;
    (2) the **sessions that passkey established are revoked** (a kicked device loses access on its
    next request — sessions are paired to their login passkey via `auth.sessions.credential_id`);
    (3) **other sessions are untouched** (sessions from other passkeys, and the limited OTP
    registration/recovery/login sessions, which have no paired credential); (4) **no civic impact** —
    `public.device_keys` (civic signing) are a separate factor, revoked independently via
    `/v1/civic/devices/revoke`.
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

## Geocoding (private address → point)

Registration **best-effort** geocodes the new profile's address into a private point so a later phase can
resolve participants into geographic [Regions](../docs/REGION-MODEL.md) (point-in-polygon). This is
**structural resolvability** ("does this address resolve to a location?") — **not** KYC residency and
**not** a district binding; no district/region id is ever stored on the user.

- **Best-effort, never blocking.** If geocoding fails, times out, returns nothing, or the address is
  below the attempt gate, registration still returns **201** with **no** cached point (warn-logged, never
  with coordinates). The cached point is **private PII** and never appears on `GET /v1/profile`, the
  OpenAPI schema, or logs.
- **Attempt gate.** Geocode only a **Canadian** address with enough signal — a postal code, or
  `line1` + `city` + `province`. Otherwise no attempt is made.
- **Current + history.** `auth.profile_geocodes` holds the user's point *as of now* (upserted on success;
  cleared only when the address drops below the gate or leaves Canada). `auth.profile_geocode_history`
  appends every distinct address→point (deduped by `address_hash`) and is **never deleted** — the basis
  for future "ever in region" filters. A *failed* re-geocode keeps the last-known-good current row.
- **Re-geocode seam.** `GeocodeService.syncGeocodeForUser(userId)` refreshes the cache from the stored
  profile when an address changes. (No `PATCH /v1/profile` route yet — the service/repo path exists for
  follow-on work.)

**Providers** (`GEOCODE_PROVIDER`, see `.env.example`):
- `stub` *(default)* — deterministic, offline, no key; resolves only valid Canadian postal codes. Used by
  CI/dev.
- `geocodio` — real provider ([geocod.io](https://www.geocod.io)), `GEOCODE_API_KEY` required; Canada-only
  results, street-level-or-better accuracy (coarser matches are dropped to `null`).
- `nominatim` — **reserved, not implemented**: selecting it fails fast at startup. A self-hosted
  Nominatim is future work — there is **no public `nominatim.openstreetmap.org`** for production use;
  self-hosting removes the OSMF rate limits, and **ODbL attribution** ("© OpenStreetMap contributors")
  is still required. Wire a provider against `GEOCODE_NOMINATIM_URL` when that lands.

## KYC verification tiers

A user's **verification tier** is an attestation the platform records in `public.kyc_attestations`
(append-only; the user's *current* tier is the latest row, `ORDER BY attested_at DESC LIMIT 1`). The
four tiers (`docs/01-CONTRIBUTOR-SPEC.md` §4) are `unverified` (no row), `identity_verified`,
`residency_verified`, and `electoral_validated`. Both recovery (`KycRepo`) and the public count filter
read this same table — one source of truth.

- **Pluggable provider** (`KYC_PROVIDER`), mirroring the geocode seam. The platform calls **`KycService`**,
  never a vendor SDK directly (docs/01 §5.1):
  - `stub` *(default)* — deterministic, offline, no key: awards the requested tier (no real identity
    check). Used by CI/dev and the dev attestation route below.
  - `equifax` — **reserved, not implemented**: selecting it fails fast at startup.
- **Tiers are a SET, not a ladder.** On counts, `?tier=` is matched by **set membership**, not
  at-or-above: a participant is counted iff their *current* tier is **in** the requested set. Tiers are
  provider/purpose-specific (identity, residency, electoral, future capabilities) and don't form a single
  strict order. `?tier=identity_verified&tier=electoral_validated` counts identity **or** electoral, not
  residency. `unverified` in the set includes participants with no attestation row (and unlinkable ones).
- **Dev attestation route** (`POST /v1/dev/kyc/attest`, body `{ tier? }`, full session) — registered
  **only** when `NODE_ENV !== "production"` (same guard as `/walk`) and hidden from the OpenAPI spec. It
  self-attests the authenticated user so manual QA / tests can place a user at a tier without a raw SQL
  INSERT. Tests seed directly via `services.kycService.attest(userId, tier)`.

## Participant geo resolution (private)

`ParticipantGeoService` is the **service-layer bridge** from a civic-record participant to the
geography inputs the public read filter ([mvp-c7](../docs/REGION-MODEL.md)) needs. It is **private** —
the user↔participant linkage and coordinates it produces **never** appear on an unauthenticated
response or the OpenAPI schema, and it does **not** activate any filter or store a district on the
user row. Three steps:

1. **participant → `userId`.** Primary: a record row's `authorPubkey` (persona Pₜ) via the thread-key
   binding the civic engine itself uses (`PrivateStore.getThreadKey`). Fallback: a singleton's
   (`vote`/`petition_signature`/`reaction`) `nullifier` **with its `parentId`** via the platform
   attestation (`PrivateStore.getUserByNullifier`). Unsigned dev-path posts carry no nullifier but do
   carry Pₜ, so they resolve via the author path; a nullifier without its `parentId` does not resolve.
2. **`userId` → current point.** The private cached point (`GeocodeRepo.getCurrent` /
   `auth.profile_geocodes`).
3. **point → district revision.** A reverse point-in-polygon over the boundary set effective on
   `asOf` (`GeoStore.districtContaining`) — the same effective-dated set `forJurisdiction` resolves, so
   reverse agrees with forward containment. This is the **`current`-mode** resolver of
   [REGION-MODEL](../docs/REGION-MODEL.md).

Outcomes are non-throwing: an unlinkable participant or one with no geocode row yields
`hasPoint: false` (⇒ **out-of-area** for scoped C7 filters — not an error). `viewerDistrictId(userId,
jurisdiction, asOf)` returns the containing revision id for an authenticated viewer — the value
`RegionResolver.compileScope({ scope: "my-district", … })` will consume. Filter/count code still
speaks in `Region`s (via `RegionResolver`); this service only supplies points + the viewer-district
hint and never reimplements `Region.contains`.

**Region-first by default.** The `districtId` on `ParticipantGeo` and `viewerDistrictId(...)` are
**private hints** intended only for `compileScope`'s `my-district` (authenticated viewer) scope — they
are *not* the way to filter a discussion. For `impacted-region` / `jurisdiction` scopes, count/filter
code resolves one `Region` (via `RegionResolver`) and calls **`participantInRegion(ref, region)`**
(→ `region.contains(point)`), never comparing `districtId` strings. One call site then serves every
Region kind (district / union / jurisdiction / custom), and no "is user *U* in district *D*" surface
is ever exposed. See [REGION-MODEL § Discussion-scoped stake filtering](../docs/REGION-MODEL.md).

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
4. **Enroll passkey** → 5. **Civic golden path** (the real `@oursay/identity` SDK) →
   6. **Logout** → 7. **Passkey login** (usernameless) → reads `/v1/profile`.
8. **Sign in on another device** — from the authenticated session, enable cross-device login (sends a
   `login` code), then *simulate the new device*: verify the code → enroll-only session → enroll a
   passkey → log in for full access.
9. **Recovery** — email code (unified request, `purpose:recovery`) → recovery-scoped session →
   re-enroll a passkey (the "lost passkey" path; contrast with step 8).

Step 5 runs the production browser custody + write path with the real SDK, bundled for the browser at
**`/walk/identity.js`** (a dev-only `esbuild` bundle of `@oursay/identity/client/browser`, built on
first request and cached for the process). It unlocks a **separate** civic-custody passkey (expect a
second prompt — distinct from the account-login passkey), then joins an `ab-ca-gov` thread (ownership
only, no kycTier) and creates a post; the page shows the `txId`/`entityId` and the custody source
(`prf` vs the `secure-store` fallback). **Cache caveat:** the bundle is built once per process — restart
the dev server after editing the identity SDK to pick up changes.

Beneath the one-click smoke test, step 5 also exposes **granular sub-steps 5a–5e** for hand QA —
**5a** unlock civic custody → **5b** join thread → **5c** create root post → **5d** add comment →
**5e** add reaction. They run the same SDK phase by phase against the same thread and demonstrate
**unlock once, sign many**: only 5a may prompt WebAuthn; 5b–5e reuse the already-unlocked
`IdentitySession` with no further prompt. Each button is gated until its prerequisite exists.

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

## Civic write routes

Beyond civic device-key enrollment (`/v1/civic/devices`), the API exposes the civic **write** path
over the `@oursay/identity` `IdentityRegistry` — thin HTTP over reused crypto (no envelope/binding
logic here). All require a **full session**; the caller's `userId` must own the device, persona, and
signer involved, and the engine is the verified path (`requireDeviceSigner` — a persona-only/unsigned
envelope is rejected):

- `POST /v1/civic/threads/join` — bind account↔thread-key **ownership** (platform-signed binding +
  thread signer). No KYC tier is fixed at join; verification tier is applied at read/count time.
- `POST /v1/civic/appends/prepare` — server-derived fields for a civic intent (post, comment,
  reaction, petition, petition_signature, poll, vote — create/update/delete as the type allows).
- `POST /v1/civic/appends/submit` — accept a client+device-signed envelope into the record pool.

`submit` only **pools** the write (Postgres `record_outbox`, tagged with the API's civic chain id —
`CHAIN_ID`, default **`ab-ca-gov`**, the launch jurisdiction). It reaches the append-only ledger and
external anchors only once a block is **settled** and **published** — the job of the public-record
**settlement worker** (`npm run worker --workspace public-record`), whose `WORKER_CHAIN_IDS` default
(`oursay-global,ab-ca-gov`) includes `ab-ca-gov`, so it settles + anchors these writes with no extra
config. Run it alongside the API; see [`public-record/README.md`](../public-record/README.md) →
"The settlement worker".

The launch jurisdiction (`ab-ca-gov`, provincial; votes/signatures final by default) is registered at
composition (`buildServices`). See `src/services/civic-record.service.ts` and
`src/http/routes/civic-record.routes.ts`.

## Civic public read routes

Unauthenticated reads of the civic record (`/v1/public/…`, tag `public`) — enough to render browse +
detail pages for the three root entity types: **post** (product label "Belief"), **petition**, and
**poll**. No session, no `Authorization`: aggregate public data is open to audit/research (docs/01
§7.1). These are the read counterpart to the civic **write** routes above; they never touch private
profile/KYC rows. HTTP stays thin — all assembly is done in `PublicRecordReadService`
(`src/services/public-record-read.service.ts`) over `@oursay/public-record`'s fold-on-read
projections (`getThread`, `reactionTallies`) and store queries (`getPollResults`,
`getPetitionSignatureCount`, `listRootEntities`); no projection logic is duplicated here.

| Route | Returns |
|-------|---------|
| `GET /v1/public/{posts,petitions,polls}` | browse list (newest first), each item with audience scope + a headline count (post → reaction tallies, petition → `signatureCount`, poll → option `results`) |
| `GET /v1/public/{posts,petitions,polls}/:id` | the folded thread: root + reaction tallies + nested comment tree, plus the type-specific count |
| `GET /v1/public/{posts,petitions,polls}/:id/counts` | just the counts, with **live geo `scope` + KYC `tier` resolution** (region-first + set-membership tier + k-anonymity) and the filter echo; date still stubbed |

Responses use **`PublicEntityView`** semantics: redacted/erased content stays withheld (`content:
null, withheld: true`); the commitment still proves inclusion. Tombstoned (deleted) roots are excluded
from lists and 404 on detail. Each root carries **audience scope**: `jurisdiction` (from the thread
binding; defaults to `oursay-global` when no persona is bound) and `appliesToDistrictIds` (from the
entity's governance rules; empty ⇒ whole jurisdiction). This is metadata for clients/future filters,
not write-policy enforcement.

### Geo `scope` + KYC `tier` resolution on counts (live); date stubbed

List and count endpoints accept a coarse geo `scope`, a KYC `tier` (repeatable — a **set**), an optional
`jurisdiction` (lists only), and a `from`/`to` date range. All are **parsed and enum-validated** (a bad
`scope`/`tier` ⇒ 400). The fixed `scope` enum is deliberate (docs/06 §2–3): it keeps geography coarse and
avoids the freeform district slicing that enables cross-boundary re-identification.

On the **count** endpoints (`…/:id/counts`) geo `scope` is now **resolved**:
`RegionResolver.compileScope({ scope, jurisdictionId, appliesToDistrictIds, asOf: now })` builds one
`Region` from the entity's own audience scope, and each countable participant (a reaction / vote /
signature's `authorPubkey`, or a singleton's `nullifier`) is resolved to its **private current point**
and tested with `ParticipantGeoService.participantInRegion(ref, region)` (`current`-mode only — no C4
action-time snapshot). Counts re-aggregate over only the **distinct in-region** participants; the
distinct key matches the SQL views (`COALESCE(nullifier, author_pubkey)`). A participant with no usable
point is **out-of-area** (excluded from a scoped count; still counted in `all-public`). The filter echo
splits by dimension: `applied: { geo, tier, date: false }`.

The **`tier`** set is resolved on the same surface: each distinct participant is resolved to its
`userId` (reusing `ParticipantGeoService.resolveUserId`) and its current tier (`KycRepo.latestTier`,
defaulting to `unverified`), and is counted iff that tier is **in** the requested set (set membership,
not at-or-above). When both narrow, it is **AND** (in-region **and** in the tier set). A tier set that
lists *every* tier is a no-op (`applied.tier: false`, no tier-driven floor) since it includes everyone.

| `scope` | Audience on counts | Status |
|---------|---------------------|--------|
| `jurisdiction` | the whole-jurisdiction extent at `asOf` (`forJurisdiction`) | **live** |
| `impacted-region` | the entity's `appliesToDistrictIds` union (empty ⇒ whole jurisdiction) | **live** |
| `my-district` | the **authenticated** viewer's inferred district | **inert** — no viewer identity on public routes; no geo filter applied |
| `all-public` | all public participants, no geo filter (default) | no filter (raw) |

**K-anonymity (docs/06 §3).** When **either** a geo scope **or** a tier set narrows a count, a bucket
(reaction kind / poll option / the signature scalar) with `0 < count < effectiveK` is **suppressed**
(`count: null, suppressed: true`); a genuine `0` stays `0`, and `all-public` with no tier is never
masked. `effectiveK = max(min,
jurisdiction.privacy?.kAnonymityFloor ?? default)` from `PUBLIC_COUNTS_K_ANONYMITY_MIN`/`_DEFAULT`
(default 5/5; a deployment may only RAISE the floor; dev disables with 0/0). The applied floor is
echoed as `filters.kAnonymityFloor`.

**Scope of geo/tier filtering (intentional gap).** Only the `…/:id/counts` endpoints filter by region or
tier. Browse-list summaries and thread-detail reaction tallies (`GET /v1/public/posts/:id`, etc.) stay
**unfiltered** — `scope`/`tier` there are parsed and echoed only (`applied.geo`/`applied.tier` never
true); consumers must not assume geo/tier there.

The `from`/`to` date range is enum-validated and echoed but **does not filter** counts yet
(`applied.date` stays false).
**Perf note:** the scoped count path resolves region membership and tier per distinct participant (memoized
per request); batching point-in-polygon / tier lookups is the optimization if it bites.

### Per-jurisdiction count exposure (`countGating`)

Whether a petition signature scalar / poll vote tally may appear on the public surfaces at all is a
**per-jurisdiction policy** — a layer *above* the geo/tier filtering and k-anonymity floor. It is authored
in [`@oursay/jurisdiction-data`](../jurisdiction-data/README.md) (`JurisdictionConfig.counts`) and
registered for **every** jurisdiction at startup (`buildServices` registers all; env `JURISDICTION_ID`
only picks the default id). Each petition/poll **list item, detail, and `/counts`** response carries
`countGating` + `countGatingNote`:

| `countGating` | Meaning | Scalar |
|---|---|---|
| `none` | exposed (still subject to the k-anonymity floor) | the count (or `null` if k-anon-suppressed) |
| `withheld` | `votes`/`signatures` is `false` for this jurisdiction | `null` everywhere |
| `tier-gated` | non-empty `minTier`: exposed only when the request restricts to a tier set ⊆ `minTier` | `null` unless `…/counts?tier=…` satisfies the gate |

So a `tier-gated` scalar is **always** withheld on list/detail (those never filter by tier) — the gate is
enforced on every surface, not bypassable by reading the browse list. `countGating` reports the **policy
state** (e.g. stays `tier-gated` even on an unlocked request); the scalar's `null`-ness reports exposure,
and the petition `suppressed` flag (k-anonymity) is orthogonal. **Reaction tallies are never gated.**

The two shipped jurisdictions: **`oursay-global`** (open sandbox — `none`, raw counts) and
**`ab-ca-gov`** (launch — `tier-gated` on votes + signatures with
`minTier: [identity_verified, residency_verified]`; `electoral_validated` is intentionally excluded until
Elections Alberta provides a KYC integration).

## Not in this milestone

Production WebAuthn PRF / non-exportable browser signing for civic keys, a **real** KYC provider
(Equifax) + sponsorship/waitlist UX + provider-signed attestation rows (R27), Method-4 ZK, and
production KMS / encryption-at-rest (schema hooks only). On the public read side, geo `scope` **and** KYC
`tier` resolution + k-anonymity now ship on the count endpoints (tier via the **stub** provider); still
deferred: **date-range** filter resolution, C4 action-time / ever-in-region geo modes, multi-concurrent
tier capabilities, per-viewer district inference (authenticated routes), and `result` derived-entity
publishing.
