# turnkey-test — FINDINGS

> **Status: historical / exploratory.** This spike is **not prescriptive**. It explored
> BIP32/BIP39 hierarchical-deterministic keys with remote Turnkey custody as OurSay's identity
> backbone. We have since chosen a different model. The production identity design lives in
> [`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md) §6. This document records what the
> spike proved and why we are not building on it.

## What we explored

A single self-custody-via-vendor approach to user identity:

- Each user gets a **Turnkey sub-organization** (tenant) with a root user and a **master HD
  wallet**.
- Per-thread keys are derived at deterministic **BIP32 paths** on a shared wallet — master at
  `m/44'/60'/0'/0/0`, per-thread at `m/44'/60'/0'/1/<threadIndex>`
  ([`src/platform.ts`](./src/platform.ts)).
- The platform proves a thread key belongs to a user by sharing the account-level **xpub** with an
  independent organization, who re-derives the thread keys (no private material needed).
- Signing happens remotely in Turnkey via `signRawPayload` + `HASH_FUNCTION_NO_OP` over
  **secp256k1** (EVM curve), against a keccak256 digest of a JSON "platform binding" payload
  ([`src/flows.ts`](./src/flows.ts), [`src/platform.ts`](./src/platform.ts)).

## What the spike proved (genuine learnings — kept)

These worked and are worth recording:

- **Per-user sub-org provisioning.** A parent org can mint isolated per-user tenants, each with its
  own root user and wallet (`provisionUserWallet` in `src/flows.ts`).
- **Path-based per-thread derivation.** Distinct, mutually independent keys per thread fall out of
  a single wallet via dedicated BIP32 paths; siblings don't trivially link.
- **Raw-payload signing + identity recovery.** `signRawPayload` with `HASH_FUNCTION_NO_OP` over a
  pre-hashed digest returns `(r, s, v)`; the account metadata (`path`, `publicKey`) lets the
  platform tie a signature back to a specific user's specific thread **without publishing which
  user** (`signPlatformBindingAndIdentify` in `src/flows.ts`).
- **The "platform binding" idea.** Committing a structured payload that links a thread key to an
  account context (`PlatformBindingPayload` in `src/platform.ts`) is the seed of the production
  **registration binding** — that concept survives, in a different shape.

## Why it is no longer the chosen path

For a **non-economic public civic record aimed at mass adoption**, the HD-wallet + remote-custody
model is the wrong fit:

1. **Complexity.** BIP32/BIP39 path management, wallet provisioning, and seed handling are a large
   surface for a system whose users are citizens, not wallet operators.
2. **Wallet / EVM coupling.** The whole stack is shaped around Ethereum semantics (secp256k1,
   addresses, `m/44'/60'`). OurSay has no economic/on-chain need for wallets; that coupling is
   accidental, not essential. The chain is only a **pluggable anchor target**, not the identity
   layer.
3. **Custodial vendor dependency.** Routing every signature through a third-party HSM makes a
   commercial vendor part of the identity trust base and a single point of failure/lock-in.
4. **Poor passkey UX.** Mainstream account security is moving to **passkeys** (WebAuthn). Bolting
   HD seeds + a custody vendor onto that is worse UX than using the passkey/device platform
   directly.
5. **xpub's all-or-nothing disclosure.** This is the decisive one. Ownership proof works by sharing
   an **xpub**, which exposes **every** thread derived under it. Even a *level-scoped* xpub only
   shrinks the blast radius to a whole governmental level — never to an individual thread. A civic
   record needs **per-thread** selective disclosure, which xpub fundamentally cannot give.

## Keep vs discard

| Discard | Keep (re-homed in the new model) |
|---|---|
| BIP32 / BIP39 HD derivation, `@scure/bip32`, `@scure/bip39` | Deterministic **on-device** per-thread derivation — now **HKDF**, domain-separated from a **level-scoped master** |
| xpub-based ownership / disclosure | **Per-thread platform registration bindings** + **selective reveal** (open one thread, not all) |
| Turnkey as the **identity backbone** | Turnkey **only as an optional recovery** path, never primary |
| secp256k1 / EVM **envelope** signature semantics | **P-256** (passkey-native) as the single canonical envelope algorithm; secp256k1 stays only for the platform→EVM **anchor transaction** |
| `PlatformBindingPayload` shape (wallet/path fields) | The **binding concept**: platform signs a binding committing to `thread_pubkey, thread_id, level, kyc_tier, region, H(user_id, salt_t, thread_id, level)` |

## Pointer

The chosen model — passkey auth, level-scoped masters, HKDF per-thread keys, private registration
bindings with an opaque per-thread commitment, and selective reveal — is specified in
[`../public-record/PROPOSAL.md`](../public-record/PROPOSAL.md) §6, with normative requirements in
[`../public-record/REQUIREMENTS.md`](../public-record/REQUIREMENTS.md) (R2, R3, R7–R11) and the
privacy rationale in [`../docs/06-PRIVACY-REVIEW.md`](../docs/06-PRIVACY-REVIEW.md) §3a.
