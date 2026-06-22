# @oursay/identity

The pre-API **client identity layer** for OurSay. It turns a verified human + their devices into
device-signed record envelopes, and provides the in-process server helpers the future
`@oursay/api` will expose over HTTP. It sits on top of `@oursay/public-record` (the record engine)
and never re-implements its commitment/envelope crypto.

Method 3 (device keys + stable thread persona + per-jurisdiction nullifier) per
[`docs/08-IDENTITY-AND-DEVICE-POLICY.md`](../docs/08-IDENTITY-AND-DEVICE-POLICY.md). Method 4 (ZK)
is the long-term goal; the envelope `proof` slot stays reserve-and-reject until ZK exists.

## What to import

| Subpath | Use it from | Surface |
|---|---|---|
| `@oursay/identity/client` | browser / app (`site`), tests | `PasskeyConnector`, `DevPasskeyConnector`, `WebPasskeyConnector`, `IdentitySession` |
| `@oursay/identity/server` | the future `@oursay/api`, integration tests | `IdentityRegistry` (enroll / join / prepare / submit) |
| `@oursay/identity` | anywhere | shared client↔server DTO types |

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
// join a thread → thread_keys + thread_bindings + thread_signers
const thread = { threadId: postId, jurisdiction: "ab-ca-gov" };
await registry.joinThread({
  userId, threadId: postId, jurisdiction: "ab-ca-gov",
  personaPubkey: session.personaPubkey(thread),
  signerPubkey: session.signerPubkey(thread),
  commitment: session.bindingInputs(thread).binding.commitment,
  devicePubkey: cred.devicePubkey, kycTier: "residency_verified",
});
// create a post: prepare → device-sign → submit
const intent = { op: "create", type: "post", entityId: postId, content: { body: "hello" } };
const prep = await registry.prepare(intent, session.personaPubkey(thread));
await registry.submit(session.buildSigned(thread, prep, intent));
```

The optional browser demo (manual): `npm run serve --workspace @oursay/identity` →
http://localhost:6273 (Enroll → Unlock with a platform authenticator).

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

## What remains before `@oursay/api`

HTTP routes over `IdentityRegistry`; server-side `sessions` / `passkey_credentials` tables +
passkey login; real KYC tiers feeding `joinThread`; `WebPasskeyConnector` hardening (largeBlob /
non-exportable WebCrypto custody, secure-storage fallback when PRF is absent); and — longer term —
Method-4 ZK to replace platform nullifier attestation.
