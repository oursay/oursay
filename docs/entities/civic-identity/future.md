# Civic identity — future / deferred

Deferred design intent for the `civic-identity/` entities (thread-persona, thread-binding, thread-credential, nullifier). Not shipped.

## Reveal model (replaces claimed / claimed_at)
Linking a thread persona (Pₜ) to a public profile is the **reveal** flow:
- **Platform reveal** — reversible, recorded off-ledger.
- **On-chain reveal** — nuclear, permanent.

This replaces the deprecated `thread_keys.claimed` / `claimed_at` columns, which remain until migration. The account-side privacy surface is [09-ACCOUNT-PRIVACY-MODEL.md](../../09-ACCOUNT-PRIVACY-MODEL.md).
→ `.agents/CODE-ALIGNMENT-PROMPTS.md` `[code-drop-claimed-columns]`.

## Selective disclosure / ZK
- Salt escrow + at-rest encryption for thread bindings (KMS milestone).
- ZK membership proofs (the reserved envelope `proof` slot, Method 4) for nullifier dedupe without platform issuance.
- Selective-disclosure UX for revealing tier/attributes without revealing identity (R11).

## Legacy signer path retirement
The legacy `p256` / `device_keys` / `thread_signers` path is deprecated but retained for the dual-verifier period; retire once `webauthn-es256` is the sole civic signer everywhere.
