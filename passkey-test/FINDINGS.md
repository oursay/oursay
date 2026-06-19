# passkey-test — FINDINGS

> **Status:** evaluation spike (web identity path). **Stack:** TypeScript ESM, `@noble/hashes`,
> `@noble/curves` (P-256), WebAuthn. **Evidence:** 4 mocha suites (15 assertions, deterministic) +
> a manual browser demo. **Scope:** prove the web path and recommend a `PlatformAdapter`; **not**
> a multi-platform library. No native (iOS/Android/Windows/macOS/Linux) modules in this pass.

This spike validates the web realization of `public-record/PROPOSAL.md` §6: **passkeys for account
auth, a level-scoped master per governmental level, on-device HKDF per-thread keys signed with
P-256, and client-side per-thread binding inputs with an opaque commitment.** It reuses
`public-record`'s crypto/schema (no duplication) and pins deterministic test vectors.

## TL;DR

- **WebAuthn register/auth with P-256 (`alg -7`) on `rpId=localhost` works** — the standard,
  bundler-free `navigator.credentials` flow (Q1). Verified via the demo page; the server is a
  ~30-line no-dep static host (WebAuthn needs a secure context — `localhost` qualifies, `file://`
  does not).
- **The PRF extension supplies deterministic 32-byte derivation material** where the
  browser+authenticator support it (Q2) — **confirmed on Windows Hello / Chromium** (§2), where two
  authentications returned the identical secret. Support is **device/browser-dependent** (and the
  create-time `prf.enabled` flag under-reports), so the architecture must **not hard-depend on
  PRF**; a secure-storage master + encrypted export is the documented fallback.
- **HKDF→P-256 derivation and canonical-envelope signing are deterministic and align with
  `public-record`** (Q3). The per-thread leaf hash is the **reused `txHashOf`**, not a re-impl.
- **Per-thread binding inputs** (`thread_pubkey`, client `salt_t`, opaque
  `commitment = H(user_id, salt_t, thread_id, level)`) are produced client-side; the public
  envelope carries **`thread_pubkey` only** (Q4).
- **Keep** the web flow as the basis for a real `WebPlatformAdapter`; **discard** nothing
  structural. The one gap to design around is uneven PRF support.

---

## 1. WebAuthn on the web (Q1)

- **Registration** — `navigator.credentials.create({ publicKey })` with
  `rp.id="localhost"`, `authenticatorSelection:{ residentKey:"preferred", userVerification:"preferred" }`,
  and `extensions:{ prf:{} }` to read whether PRF is available for the new credential.
- **`pubKeyCredParams` — ES256 first, RS256 fallback.** Chrome emits a (non-fatal) lint warning if
  the list omits both ES256 (`-7`) and RS256 (`-257`). OurSay's canonical curve is **P-256
  (ES256)**, so we list `-7` **first** (every platform authenticator that supports it — Windows
  Hello, Touch ID, Android — picks it) and `-257` second only to silence the lint. We then
  **verify the credential actually used P-256** via
  `cred.response.getPublicKeyAlgorithm() === -7` and surface `isP256` in the result; a real
  implementation **rejects** any non-P-256 credential.
- **Authentication** — `navigator.credentials.get({ publicKey })` with the stored credential id and
  `extensions:{ prf:{ eval:{ first } } }`. The 32-byte PRF result is read from
  `getClientExtensionResults().prf.results.first`.
- **Passkey ≠ action signer.** The passkey authenticates the session and (optionally) unlocks
  derivation material; it does **not** sign civic actions. Envelopes are signed by the HKDF-derived
  **per-thread P-256 key** (§4), keeping the §6 separation intact.
- **Secure context** is mandatory: serve over `http://localhost` (the included `web/server.ts`);
  `file://` is rejected by WebAuthn.

## 2. PRF support matrix (Q2)

PRF (WebAuthn's PRF extension, built on CTAP2.1 `hmac-secret`) returns an authenticator-bound,
deterministic value per (credential, salt). That makes it an excellent **level-master IKM** — *when
present*.

**Live run (this spike):**

| Browser | OS | Authenticator | `prf.enabled`@create | PRF output@get | deterministic across two `get`s |
|---|---|---|---|---|---|
| Chrome 149 | Windows 11 | Windows Hello (platform) | **false** | **yes** (`05472c3c…054cbd`) | **yes** (identical both times) |

> **Gotcha worth recording:** `prf.enabled` came back **`false` at registration** on this target, yet
> `get()` returned a **deterministic 32-byte PRF value** anyway. So **gate PRF usage on the
> authentication-time result, not the create-time `enabled` flag** — the create-time flag
> under-reports on at least some platforms (Windows Hello here). The two authentications produced the
> identical secret, confirming PRF is a viable level-master IKM on this platform.

_Add rows for other targets by running the demo there._

**Reference expectations (NOT tested in this spike — confirm with the demo on your targets):**

| Browser | Platform authenticator | PRF (general) |
|---|---|---|
| Chrome / Edge (Chromium) | Windows Hello, Android, macOS Touch ID, hardware keys (hmac-secret) | Generally supported |
| Safari | iCloud Keychain passkeys (recent iOS/macOS) | Supported on recent versions |
| Firefox | platform authenticators | Historically lagging — **treat as unavailable until the demo confirms** |

Takeaway: **PRF availability is not universal**, so it is an *optimization*, not a requirement. The
fallback (§3) covers the gap.

## 3. PRF fallback — described, not built

When PRF is unavailable, derivation material must come from elsewhere without weakening the model:

- **Client-generated level master in secure storage.** Generate a random 32-byte master per level
  on-device; persist via a non-extractable WebCrypto key wrapping + IndexedDB, or WebAuthn
  `largeBlob` where supported. The HKDF→P-256 derivation in §4 is **identical** regardless of where
  the master came from — only the *source* of the 32-byte IKM differs.
- **Encrypted export for recovery / cross-device sync.** Wrap the level master(s) under a
  user-held secret (passphrase-derived key) and export an encrypted blob the user can restore on a
  new device. This is what makes R3's invariant honest: **cross-device reproduction requires
  recovery/sync of the level-master material — the passkey alone is insufficient** (the passkey
  unlocks; it does not contain the derivation secret).
- **Trade-off vs PRF.** PRF keeps the master inside the authenticator (never extractable); the
  fallback necessarily materializes the master in app memory/storage and shifts custody to the
  encrypted-export secret. Document this clearly to users. *(Designs only — not implemented here.)*

## 4. Derivation + signing (Q3/Q4) — methods and frozen vectors

- **HKDF** (`@noble/hashes/hkdf`, SHA-256): `ikm = levelMaster` (32 B), fixed app
  `salt = "oursay/v1/thread-derive"`, and **`info` domain-separated by (thread_id, level)**:
  `oursay/v1/thread-key|level=<level>|thread=<thread_id>`. Different `thread_id` **or** `level` ⇒
  different key (proven in suite 01).
- **HKDF→P-256 scalar mapping (PINNED):** HKDF-Expand to **48 bytes** (so modulo bias < 2⁻¹²⁸),
  big-endian → `x`, `scalar = (x mod (n−1)) + 1` ∈ [1, n−1], encoded big-endian to 32 bytes.
- **Signing vs leaf — two hashes:**
  - *Signing digest* = `sha256(canonicalJson(envelope))` with `signature=""` and `authorPubkey`
    already set; signed with deterministic ECDSA (RFC-6979, low-S).
  - *Leaf / chain hash* = **`txHashOf(fullEnvelope)`** imported from `@oursay/public-record` —
    `hashLeaf(canonicalJson(envelope))` over the **full** envelope **including** the signature.
    Suite 02 asserts the spike's leaf equals `txHashOf` (alignment, not re-implementation).
- **Identity commitment (encoding defined here):**
  `sha256Hex(canonicalJson({ ds:"oursay/v1/thread-commitment", user_id, salt_t, thread_id, level }))`
  with **`salt_t` as a hex string** (matching `newSalt()`), mirroring `contentCommitment`'s
  domain-tagged pattern. **Ported (done):** this is now `threadCommitment()` in
  `../public-record/src/crypto/commitment.ts`, and `derive`/`envelope`/`binding` were promoted into
  `../public-record/src/identity/*` (with `signBinding`/`verifyThreadBinding` + the
  `RecordService.appendSigned` verified-tier gate added server-side). The pure derivation and
  `threadCommitment` vectors carry over unchanged; the production envelope `signature`/`txHash`
  vectors differ because production binds `contentHash` to `txId` — see
  `../public-record/test/fixtures/identity-vectors.ts` and suites `10-identity-crypto` /
  `12-signed-append`.

**Frozen vectors** (`src/vectors.ts`; regenerate with `npx tsx scripts/compute-vectors.ts`):

```
levelMaster   = 000102…1f (32 bytes)
user_id="user-alice"  thread_id="thread-belief-42"  level="federal"
salt_t        = a1a2…bebf (32 bytes, hex)
threadPubkey  = 0323a8ea4ff23736e96bcad3afefdc30475d06e18b780648af011c2d9fc46d61af   (compressed SEC1)
commitment    = 1076a12c3938dd82d72ee457cc13b56d2c0648d5b6c62b2679be6beb91cc1a33
signature     = 859f2916…d35942   (deterministic ECDSA, compact r||s)
txHash (leaf) = 8f71db141d785a537414f64cb9c7b0cc3bc9cc7aca73378b0d9fc598b6329f89
```

## 5. `PlatformAdapter` interface (sketch) — web now, native later

One seam so every platform shares one identity API. **Only `WebPlatformAdapter` is contemplated in
this spike**; native adapters implement the same shape later.

```ts
interface PlatformAdapter {
  // account auth (passkey) — authenticates a session; does NOT sign civic actions
  registerPasskey(o: { userId: string; userName: string }): Promise<PasskeyRef>;
  authenticatePasskey(o: { challenge: Uint8Array }): Promise<AuthAssertion>;

  // derivation material: PRF when available, else secure-storage master (§3 fallback)
  prfAvailable(): Promise<boolean>;
  getLevelMaster(o: { level: string }): Promise<Uint8Array>; // 32-byte HKDF IKM

  // per-thread keys (HKDF from a level master) + P-256 signing  (src/derive.ts, src/envelope.ts)
  deriveThreadKey(o: { level: string; threadId: string }):
    Promise<{ threadPubkey: string; sign(digest: Uint8Array): Promise<string> }>;

  // client-side binding inputs (Q4) — the PLATFORM signs the binding, not the client (src/binding.ts)
  buildThreadBindingInputs(o: { userId: string; threadId: string; level: string;
    kycTier?: string; region?: string }):
    Promise<{ thread_pubkey: string; thread_id: string; level: string; kyc_tier?: string;
              region?: string; commitment: string; opening: { user_id: string; salt_t: string } }>;
}
```

- **`WebPlatformAdapter`** = WebAuthn (`navigator.credentials`) for auth + PRF/secure-storage for
  `getLevelMaster`, then the spike's `@noble`-based `deriveThreadKey` / `signEnvelope` /
  `buildThreadBindingInputs`. No bundler required for the crypto (Node/Web both run `@noble`); the
  demo page itself imports nothing.
- **Native path (later):** iOS Secure Enclave + Passkeys, Android Keystore + Credential Manager,
  Windows Hello, macOS/Linux platform stores — each implements the same interface. Only
  `registerPasskey`/`authenticatePasskey`/`getLevelMaster` are platform-specific; **`deriveThreadKey`,
  `signEnvelope`, and the commitment/binding logic stay shared** (pure `@noble`), which is the main
  payoff of pinning them here.

## 6. Keep vs discard

| Keep (graduates toward a real adapter) | Discard / avoid |
|---|---|
| WebAuthn P-256 register/auth flow (`alg -7`, `rpId=localhost`) | Treating the passkey as the action signer |
| PRF as level-master IKM **where available** | Hard-depending on PRF (uneven support) |
| HKDF (domain-separated) → P-256, pinned scalar mapping | BIP32 paths / xpub (already dropped — see `../turnkey-test/FINDINGS.md`) |
| Reusing `public-record` `canonicalJson`/`sha256Hex`/`txHashOf` | Re-implementing canonical JSON, Merkle, or commitments |
| The `salt_t`-hex identity-commitment encoding (port to public-record) | Putting the commitment/opening on the public envelope |
| `PlatformAdapter` seam (web now, native later) | Building native modules in this pass |

## 7. Test inventory

| Suite | Proves |
|---|---|
| `test/01-derive.spec.ts` | HKDF derivation deterministic; **domain separation** (thread_id/level); valid P-256 scalar; matches frozen `threadPubkey`. |
| `test/02-envelope-sign.spec.ts` | P-256 sign/verify; **leaf == `txHashOf`** over the full signed envelope; tamper ⇒ verify fails & leaf changes; matches frozen `signature`/`txHash`. |
| `test/03-commitment.spec.ts` | Commitment deterministic; changes on any input incl. `salt_t`; **opaque** (no preimage leak); matches frozen `commitment`. |
| `test/04-binding-inputs.spec.ts` | Public binding has exactly the §6 fields; commitment binds the opening; fresh `salt_t` when unsupplied; **envelope carries `thread_pubkey` only** (no commitment/opening). |
| `web/` demo (manual) | Q1 register/auth (P-256); Q2 PRF availability + deterministic 32-byte output; renders the §2 support-matrix row. |

Run: `npm test` (suites), `npm run serve` then open the demo (manual Q1/Q2). See
[`README.md`](./README.md).
