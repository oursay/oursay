# passkey-test

> **Historical spike — kept for reference.** The crypto primitives proven here (HKDF per-thread
> derivation, P-256 envelope signing, the opaque per-thread commitment) have been **promoted into the
> production library** at `public-record/src/identity/*` and `public-record/src/crypto/commitment.ts`
> (`threadCommitment`). That is their production home; build on those, not on this spike. This
> workspace stays intact as the evaluation record (per `docs/PHILOSOPHY.md` §2.2). Note: the library's
> envelope `signature`/`txHash` vectors differ from this spike's by design — production binds
> `contentHash` to `txId` (see `public-record/test/fixtures/identity-vectors.ts`).
>
> **Old terminology:** this spike predates the jurisdiction vocabulary and still uses `level`/`region`;
> the promoted library uses `jurisdiction` (level is now a property of it). See [`docs/GLOSSARY.md`](../docs/GLOSSARY.md) for the current, canonical terms.

Evaluation spike for OurSay's **web identity path** — the browser realization of
`public-record/PROPOSAL.md` §6. It answers four questions with tests/evidence and records them in
[`FINDINGS.md`](./FINDINGS.md) (the primary output). It is **not** a multi-platform library; no
native modules are built here.

Questions:
1. **WebAuthn passkey register + authenticate (P-256)** on a dev `rpId` (`localhost`).
2. **WebAuthn PRF extension** as deterministic level-master derivation material — support matrix +
   a described (not built) secure-storage fallback.
3. **HKDF per-thread derivation + P-256 signing of a canonical `TxEnvelope`** — deterministic
   vectors aligned with `public-record` (incl. its `txHashOf`).
4. **Client-side per-thread binding inputs** — `thread_pubkey`, client `salt_t`, opaque
   commitment `H(user_id, salt_t, thread_id, level)`; types/payload only, no backend.

It **reuses** `@oursay/public-record` crypto/schema (`canonicalJson`, `sha256Hex`,
`contentCommitment`, `txHashOf`, the `TxEnvelope` type) rather than duplicating them.

## Prerequisites

- Node ≥ 20 (repo workspace install: `npm install` at the repo root).
- For the browser demo only: a browser with a platform authenticator (Touch ID / Windows Hello /
  Android / a passkey). PRF support varies — that's part of the finding.

## Run

```bash
# deterministic crypto/derivation/vectors (Q3, Q4) — headless, CI-friendly
npm test --workspace passkey-test
npm run typecheck --workspace passkey-test

# WebAuthn + PRF demo (Q1, Q2) — manual, in a real browser
npm run serve --workspace passkey-test          # http://localhost:5173
#   if 5173 is busy:  PORT=5188 npm run serve --workspace passkey-test
# then open the URL, click Register → Authenticate, and copy the support-matrix row into FINDINGS §2
```

WebAuthn needs a **secure context**; `http://localhost` qualifies (`file://` does not), which is
why the demo is served rather than opened as a file.

## Layout

| Path | Purpose |
|------|---------|
| `src/derive.ts` | HKDF (domain-separated by thread_id+level) → P-256 per-thread key; pinned scalar mapping |
| `src/envelope.ts` | P-256 sign/verify of a canonical `TxEnvelope`; leaf via reused `txHashOf` |
| `src/commitment.ts` | `threadCommitment()` = `H(user_id, salt_t, thread_id, level)` (composed from public-record) |
| `src/binding.ts` | `buildThreadBindingInputs()` — public binding + private opening (no backend) |
| `src/vectors.ts` | frozen inputs + expected hex (regression gate) |
| `scripts/compute-vectors.ts` | regenerate the frozen vectors |
| `test/01–04*.spec.ts` | the four mocha suites (see FINDINGS §7) |
| `web/server.ts` · `index.html` · `app.js` | no-dep static host + WebAuthn/PRF demo page |

See [`FINDINGS.md`](./FINDINGS.md) for the support matrix, the PRF fallback, the `PlatformAdapter`
sketch, and the native-adapter path.
