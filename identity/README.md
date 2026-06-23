# @oursay/identity

The **client identity layer** for OurSay. It turns a verified human + their devices into
device-signed record envelopes, ships a thin HTTP client (`CivicHttpClient`) that drives the civic
write API, and provides the in-process server helpers `@oursay/api` exposes over HTTP. It sits on top
of `@oursay/public-record` (the record engine) and never re-implements its commitment/envelope crypto.

Method 3 (device keys + stable thread persona + per-jurisdiction nullifier) per
[`docs/08-IDENTITY-AND-DEVICE-POLICY.md`](../docs/08-IDENTITY-AND-DEVICE-POLICY.md). Method 4 (ZK)
is the long-term goal; the envelope `proof` slot stays reserve-and-reject until ZK exists.

## What to import

| Subpath | Use it from | Surface |
|---|---|---|
| `@oursay/identity/client` | browser / app (`site`), tests | `PasskeyConnector`, `DevPasskeyConnector`, `WebPasskeyConnector`, `IdentitySession`, `CivicHttpClient` |
| `@oursay/identity/server` | `@oursay/api` (civic write routes), integration tests | `IdentityRegistry` (enroll / join / prepare / submit) |
| `@oursay/identity` | anywhere | shared client↔server DTO types |

`CivicHttpClient` is the **thin SDK over the `@oursay/api` civic write surface** (`/v1/civic/devices`,
`/threads/join`, `/appends/prepare`, `/appends/submit`). It is fetch + JSON + orchestration only — it
holds an unlocked `IdentitySession` and runs *ensure device enrolled → join thread → prepare →
device-sign → submit* for you, while still exposing the low-level steps for advanced use. All crypto
stays in `IdentitySession` + `@oursay/public-record`.

Only **public** material crosses client → server (pubkeys, the opaque commitment, signed
envelopes). Private roots, the salt opening, and device-private keys never leave the client.

## The two connectors (one interface)

- **`WebPasskeyConnector`** — real browser WebAuthn. A passkey authenticates the session and, via
  the PRF extension, unlocks a 32-byte root that HKDF-expands into the device root + per-(user,
  jurisdiction) jurisdiction-master / nullifier-root. The passkey never signs civic actions.
- **`DevPasskeyConnector`** — a **simulated passkey for dev + CI**. No browser, no Touch ID, no
  prompts. **Guarded:** the constructor throws unless `OURSAY_DEV_PASSKEY=1` *and*
  `NODE_ENV !== "production"`. Deterministic from a `seed`; custody under `.oursay-dev/`.

## Run dev / CI with the simulated passkey

```bash
# 1. bring up the record engine (Postgres + immudb)
npm run db:up --workspace public-record

# 2. run the identity layer (env flag REQUIRED for the dev connector)
OURSAY_DEV_PASSKEY=1 npm test --workspace @oursay/identity
```

In code:

```ts
import { DevPasskeyConnector, IdentitySession } from "@oursay/identity/client";
import { IdentityRegistry } from "@oursay/identity/server";

const connector = new DevPasskeyConnector({ seed: "local-dev" }); // needs OURSAY_DEV_PASSKEY=1
const cred = await connector.enrollDevice({ userId, label: "laptop" });
const session = new IdentitySession(await connector.unlock({ userId, deviceId: cred.deviceId }));

await registry.ensureUser({ userId });
await registry.enrollDevice({ userId, devicePubkey: cred.devicePubkey });
// join a thread → thread_keys + thread_bindings + thread_signers (ownership only — no kycTier;
// verification tier is applied at read/count time, not fixed at join)
const thread = { threadId: postId, jurisdiction: "ab-ca-gov" };
await registry.joinThread({
  userId, threadId: postId, jurisdiction: "ab-ca-gov",
  personaPubkey: session.personaPubkey(thread),
  signerPubkey: session.signerPubkey(thread),
  commitment: session.bindingInputs(thread).binding.commitment,
  devicePubkey: cred.devicePubkey,
});
// create a post: prepare → device-sign → submit
const intent = { op: "create", type: "post", entityId: postId, content: { body: "hello" } };
const prep = await registry.prepare(intent, session.personaPubkey(thread));
await registry.submit(session.buildSigned(thread, prep, intent));
```

### Over HTTP — `CivicHttpClient`

When the record engine lives behind `@oursay/api`, drive it with the SDK instead of in-process
`IdentityRegistry`. Construct it with the API base URL, an unlocked `IdentitySession`, and a
full-scope session token; the client orchestrates enrol → join → prepare → sign → submit:

```ts
import { DevPasskeyConnector, IdentitySession, CivicHttpClient } from "@oursay/identity/client";

const connector = new DevPasskeyConnector({ seed: "local-dev" }); // needs OURSAY_DEV_PASSKEY=1
const cred = await connector.enrollDevice({ userId, label: "laptop" });
const session = new IdentitySession(await connector.unlock({ userId, deviceId: cred.deviceId }));

const client = new CivicHttpClient({ baseUrl: "http://localhost:8080", session, token });
const thread = { threadId: postId, jurisdiction: "ab-ca-gov" };

// one call: ensure device enrolled → join thread (ownership-only, no kycTier) → prepare → sign → submit
const ref = await client.createPost(thread, { body: "hello" });
// advanced: client.joinThread / client.prepare / session.buildSigned / client.submit are all exposed
```

In the browser the only change is the connector and auth: `new WebPasskeyConnector()` for real
WebAuthn custody, plus either a Bearer `token` or `{ credentials: "include" }` to send the session
cookie. Everything else is identical.

### Browser custody (`WebPasskeyConnector`)

A WebAuthn passkey **unlocks** the derivation root (it never signs civic actions). When the
authenticator supports the **PRF** extension, the root stays inside the authenticator. When PRF is
unavailable, `WebPasskeyConnector` falls back to a **secure-storage master** (`secure-store.ts`): a
random 32-byte master sealed under a **non-extractable AES-GCM key in IndexedDB** — it never throws,
and the HKDF→P-256 derivation is identical (only the IKM source differs). `connector.lastUnlockSource`
reports `"prf"` or `"secure-store"`. Derived thread-scoped signers are ephemeral in memory; the
platform only ever receives public keys, the opaque commitment, and the signed envelope.

Two custody notes:

- **Source-consistency invariant** — a credential must `enrollDevice` and `unlock` via the **same**
  root source. The `devicePubkey`/persona are functions of the root, so a device whose PRF availability
  changes derives different keys and must **re-enroll**. (No auto-detection; re-enroll is the remedy.)
- **Account-login vs civic custody are distinct credentials** — the account passkey proves the session;
  `WebPasskeyConnector` mints/uses a *separate* civic-custody credential. A user enrolling both sees two
  passkey prompts. Cross-device sync of the fallback master (encrypted export under a user-held secret)
  is design-only — not built.

Production PRF hardening (largeBlob custody, broader fallback coverage) is tracked under
[mvp-a3-browser-custody].

### Browser manual QA against a local API

The browser-only paths (WebAuthn PRF, IndexedDB) are exercised by hand via the `@oursay/api` walk
harness, which runs **this SDK** end-to-end:

```bash
npm run db:up --workspace public-record   # Postgres + immudb
npm run dev --workspace @oursay/api        # serves http://localhost:8080
```

Open `http://localhost:8080/walk` in a browser with a platform authenticator (Touch ID / Windows
Hello) and: **1–3** register + verify the emailed OTP (the code prints to the API console) → **4**
enroll an account-login passkey → **5** run the **civic golden path**: this enrolls a *separate*
civic-custody passkey (second prompt), then the SDK joins a fresh `ab-ca-gov` thread (ownership only,
no kycTier) and creates a post — the page shows the returned `txId`/`entityId` and the custody source
(`prf` vs `secure-store`). To exercise the fallback, run it in a browser without PRF (e.g. Firefox);
the flow still completes via `secure-store`.

Beneath the one-click golden path, step 5 has **granular sub-steps** that drive the same SDK phase by
phase — **5a** unlock civic custody (`enrollDevice` → `unlock` → `IdentitySession` + `CivicHttpClient`,
device enrolled) → **5b** `ensureJoined` → **5c** `createPost` → **5d** `createComment` → **5e**
`addReaction`. They prove **unlock once, sign many**: only 5a may prompt WebAuthn; 5b–5e reuse the
already-unlocked session with no further prompt. Run them in order; each is gated on its prerequisite.

The legacy standalone demo (manual, account auth only): `npm run serve --workspace @oursay/identity` →
http://localhost:6273.

## Clean slate — one command, three levers

Dev passkey custody lives in **`.oursay-dev/`** (gitignored), separate from the DB/chain volumes.
A full destroy wipes **everything** so no keys orphan across runs:

```bash
npm run reset --workspace @oursay/identity
```

This runs `public-record`'s `docker compose down -v` (Postgres + immudb volumes) **and** deletes
`.oursay-dev/`. The three reset levers:

| Lever | Wipes | When |
|---|---|---|
| `store.reset()` | Postgres tables (TRUNCATE) | per-test isolation |
| `db:down -v` (public-record) | Postgres + immudb volumes | full DB/chain reset |
| `DevPasskeyConnector.destroyAll()` / `.oursay-dev/` wipe | simulated passkey custody | full key reset |
| `npm run reset` (here) | **all of the above** | one clean slate |

All destructive npm scripts and `PrivateStore.reset()` **refuse when `NODE_ENV=production`** (see
`scripts/destructive-guard.ts`). There is no in-production override — take the deployment offline and
restore from backup instead.

## Production intent

Verified writes go through the **device-signed** path — `IdentityRegistry` builds its
`RecordService` with `requireDeviceSigner: true`, so persona-only signing is rejected on the
verified record. Persona-only signing is a dev/test fallback only. The `DevPasskeyConnector` is
impossible to construct in production (env guard).

## What remains

HTTP routes over `IdentityRegistry` now ship in `@oursay/api` (`/v1/civic/threads/join`,
`/v1/civic/appends/prepare`, `/v1/civic/appends/submit`), with `sessions` / `passkey_credentials` +
passkey login. A join binds **ownership** only — KYC tier is **not** fixed at `joinThread`; it is
applied at read/count time from the user's current attestation. `WebPasskeyConnector` now has the
PRF-unavailable secure-storage fallback (non-extractable AES master in IndexedDB), and the walk harness
runs the SDK end-to-end in a real browser. Remaining: cross-device encrypted export of the fallback
master (design-only); largeBlob custody; and — longer term — Method-4 ZK to replace platform nullifier
attestation.
