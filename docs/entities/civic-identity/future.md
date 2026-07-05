# Civic identity — future / deferred

Deferred design intent for the `civic-identity/` entities (thread-persona, thread-binding, thread-credential, nullifier). Not shipped.

## Reveal model (replaces claimed / claimed_at)
Linking a thread persona (Pₜ) to a public profile is the **reveal** flow:
- **Platform reveal** — reversible, recorded off-ledger.
- **On-chain reveal** — nuclear, permanent.

This replaces the deprecated `thread_keys.claimed` / `claimed_at` columns, which remain until migration. The account-side privacy surface is [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md).
→ `[code-drop-claimed-columns]`. <!-- see .agents/CODE-ALIGNMENT-PROMPTS.md -->

## Selective disclosure / ZK
- Salt escrow + at-rest encryption for thread bindings (KMS milestone).
- ZK membership proofs (the reserved envelope `proof` slot, Method 4) for nullifier dedupe without platform issuance.
- Selective-disclosure UX for revealing tier/attributes without revealing identity (R11).

## Biometric signing tiers
The `p256` quick-sign path is a permanent production method (the "Quick" signing preference; the floor on `oursay-global`), so there is no signer-path retirement. Future work is upward: biometric `signTier` levels (2 fingerprint · 3 face) derived from authenticator metadata, extending the 0 quick · 1 passkey projection surfaced on read DTOs and the Signed filter ladder.
