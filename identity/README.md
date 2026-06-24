# @oursay/identity

The **client identity layer** for OurSay. It turns a verified human + their devices into
WebAuthn-signed record envelopes, ships a thin HTTP client (`CivicHttpClient`) that drives the civic
write API, and provides the in-process server helpers `@oursay/api` exposes over HTTP. It sits on top
of `@oursay/public-record` (the record engine) and never re-implements its commitment/envelope crypto.

**Option A + mvp-a5b persona/signer split** per
[`docs/08-IDENTITY-AND-DEVICE-POLICY.md`](../docs/08-IDENTITY-AND-DEVICE-POLICY.md): each
`(device, thread)` has its **own** WebAuthn passkey — its public key is the envelope's
**`signerPubkey`**. All of a user's devices share a **stable thread persona Pₜ** (first-wins per
`(user, thread)` at join) which is the envelope's **`authorPubkey`** — so cross-device edits work
out of the box. **Every** civic append is a fresh user-verifying assertion
(`signScheme: "webauthn-es256"`) verified against `signerPubkey`. The account-login passkey
unlocks once to seed the per-(user, jurisdiction) **nullifier root** only (separate from
signing). Method 4 (ZK) is the long-term goal; the envelope `proof` slot stays reserve-and-reject
until ZK exists.

## What to import

| Subpath | Use it from | Surface |
|---|---|---|
| `@oursay/identity/client` | browser / app (`site`), tests | `PasskeyConnector`, `DevPasskeyConnector`, `WebPasskeyConnector`, `IdentitySession`, `CivicHttpClient` |
| `@oursay/identity/server` | `@oursay/api` (civic write routes), integration tests | `IdentityRegistry` (enroll / join / prepare / submit) |
| `@oursay/identity` | anywhere | shared client↔server DTO types |

`CivicHttpClient` is the **thin SDK over the `@oursay/api` civic write surface**
(`/threads/join`, `/appends/prepare`, `/appends/submit`). It is fetch + JSON + orchestration only — it
holds an `IdentitySession` and runs *join thread → prepare → WebAuthn-sign → submit* for you, while
still exposing the low-level steps for advanced use. All crypto stays in `IdentitySession` +
`@oursay/public-record`.

Only **public** material crosses client → server (pubkeys, the opaque commitment, signed
envelopes). Private roots, the salt opening, and passkey-private keys never leave the client.

## The two connectors (one interface)

- **`WebPasskeyConnector`** — real browser WebAuthn. The account passkey authenticates the session and,
  via the PRF extension (or the secure-storage fallback), unlocks a 32-byte root for the per-(user,
  jurisdiction) nullifier root. Civic signing uses a **separate per-thread passkey**:
  `createThreadCredential` (`navigator.credentials.create`, UV) at join, then `assertThread`
  (`navigator.credentials.get`, UV) per append. The per-thread credential index lives in
  `ThreadPasskeyStore` (localStorage handles only).
- **`DevPasskeyConnector`** — a **simulated passkey for dev + CI**. No browser, no Touch ID, no
  prompts; it builds real `webauthn-es256` assertions deterministically so CI exercises the actual
  verifier. **Guarded:** the constructor throws unless `OURSAY_DEV_PASSKEY=1` *and*
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
const cred = await connector.enrollDevice({ userId, label: "laptop" }); // account custody (nullifier root)
const session = new IdentitySession(await connector.unlock({ userId, deviceId: cred.deviceId }));

await registry.ensureUser({ userId });
// join a thread (mvp-a5b persona/signer split):
//   - this device's per-thread WebAuthn passkey pubkey is sent as `signerPubkey`
//   - first-wins per (user, thread): the first device's signer becomes Pₜ, written to `thread_keys`
//     + `thread_bindings`; this device's signer goes into `thread_civic_credentials` under that Pₜ
//   - subsequent devices: the server returns the EXISTING Pₜ; a new `thread_civic_credentials` row
//     is written for the device's signer; the device must present the same commitment as the first
// the server returns the canonical Pₜ; the session persists it before any prepare/buildSigned.
const thread = { threadId: postId, jurisdiction: "ab-ca-gov" };
const { binding } = await session.bindingInputs(thread);
const { personaPubkey } = await registry.joinThread({
  userId, threadId: postId, jurisdiction: "ab-ca-gov",
  signerPubkey: binding.thread_pubkey, // = this device's per-thread WebAuthn passkey pubkey
  commitment: binding.commitment,
});
session.rememberPersona(thread, personaPubkey); // = authorPubkey on every envelope from this session
// create a post: prepare → WebAuthn-sign (a user-verifying assertion) → submit
const intent = { op: "create", type: "post", entityId: postId, content: { body: "hello" } };
const prep = await registry.prepare(intent, await session.authorPubkey(thread));
await registry.submit(await session.buildSigned(thread, prep, intent));
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

// one call: join thread (registers this device's signer under Pₜ; persists Pₜ on the session)
//           → prepare → WebAuthn-sign (authorPubkey=Pₜ, signerPubkey=device) → submit
const ref = await client.createPost(thread, { body: "hello" });
// advanced: client.joinThread (→ { personaPubkey: Pₜ }) / client.prepare / session.buildSigned /
//           client.submit / session.rememberPersona are all exposed
```

In the browser the only change is the connector and auth: `new WebPasskeyConnector()` for real
WebAuthn custody, plus either a Bearer `token` or `{ credentials: "include" }` to send the session
cookie. Everything else is identical.

### Browser custody (`WebPasskeyConnector`)

**Civic signing is a per-thread WebAuthn passkey.** At join, `createThreadCredential` mints the thread's
own credential (UV + resident key); each append calls `assertThread` for a fresh user-verifying
assertion whose challenge is the envelope's signing digest. The private key never leaves the
authenticator, and the platform only ever receives public keys, the opaque commitment, and the signed
envelope.

The **account** passkey separately **unlocks** a derivation root that seeds the per-(user, jurisdiction)
**nullifier root** (it never signs civic actions). When the authenticator supports the **PRF** extension
the root stays inside the authenticator; when PRF is unavailable, `WebPasskeyConnector` falls back to a
**secure-storage master** (`secure-store.ts`): a random 32-byte master sealed under a **non-extractable
AES-GCM key in IndexedDB** — it never throws, and the HKDF derivation is identical (only the IKM source
differs). `connector.lastUnlockSource` reports `"prf"` or `"secure-store"`.

Two custody notes:

- **Source-consistency invariant** — a credential must `enrollDevice` and `unlock` via the **same**
  root source, since the nullifier root is a function of it; a device whose PRF availability changes
  must **re-enroll**. (No auto-detection; re-enroll is the remedy.)
- **Account-login, account-custody, and per-thread civic passkeys are distinct credentials.** A user
  participating in a thread sees a prompt to create the per-`(device, thread)` passkey and a prompt
  **per civic action**. Under the mvp-a5b persona/signer split, **cross-device editing just works**
  — every device signs as the same Pₜ, so a second device's signer can edit/delete entities the
  first device created (no synced passkey required). Cross-device sync of the **fallback master**
  (the PRF-unavailable IKM) is still design-only, and PRF-availability inconsistency between
  devices remains a documented caveat for the per-(user, jurisdiction) nullifier root.

- **Account recovery.** Recovery revokes the user's `thread_civic_credentials` rows (their device
  signers) but **preserves** `thread_keys` + `thread_bindings`. Pₜ is the same after recovery; the
  user re-authorizes per thread by enrolling a fresh device credential under the same Pₜ. Until
  they do, that thread is silently read-only for their persona. Plan messaging accordingly.

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
enroll an account-login passkey → **5** run the **civic golden path**: the SDK unlocks account custody,
joins a fresh `ab-ca-gov` thread (which creates the thread's passkey), and creates a post — the page
shows the returned `txId`/`entityId` and the custody source (`prf` vs `secure-store`). To exercise the
fallback, run it in a browser without PRF (e.g. Firefox); the flow still completes via `secure-store`.

Beneath the one-click golden path, step 5 has **granular sub-steps** that drive the same SDK phase by
phase — **5a** unlock account custody → **5b** `ensureJoined` (creates the thread passkey) → **5c**
`createPost` → **5d** `createComment` → **5e** `addReaction`. Under Option A they prove **user
verification per action**: 5a prompts once for the account unlock, 5b creates the thread passkey, and
**5c–5e each prompt** for a fresh assertion. Run them in order; each is gated on its prerequisite.

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

Verified writes go through the **`webauthn-es256`** path — every civic append carries a per-thread
WebAuthn assertion (UV required), and the jurisdiction signing policy hard-requires it for `vote` and
`petition_signature`. The record engine retains the legacy derived-`p256` path as a dual-verifier
capability (and `requireDeviceSigner` still guards *that* branch), but the production client never
produces it. The `DevPasskeyConnector` is impossible to construct in production (env guard).

## What remains

HTTP routes over `IdentityRegistry` now ship in `@oursay/api` (`/v1/civic/threads/join`,
`/v1/civic/appends/prepare`, `/v1/civic/appends/submit`), with `sessions` / `passkey_credentials` +
passkey login. A join binds **ownership** only — KYC tier is **not** fixed at `joinThread`; it is
applied at read/count time from the user's current attestation. `WebPasskeyConnector` now has the
PRF-unavailable secure-storage fallback (non-extractable AES master in IndexedDB), and the walk harness
runs the SDK end-to-end in a real browser. Remaining: cross-device encrypted export of the fallback
master (design-only); largeBlob custody; and — longer term — Method-4 ZK to replace platform nullifier
attestation.
