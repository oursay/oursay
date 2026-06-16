# @oursay/immudb-test

A throwaway evaluation workspace for **immudb** as the backbone of OurSay's public,
tamper-evident civic data. It answers four questions, each backed by tests:

1. **Shape** — how to model public/verifiable "tables" vs private data.
2. **Tamper-evidence** — what an *altered* immudb looks like, and whether we detect it.
3. **Redaction** — Online Harms Act compliance: stop distributing a message while keeping
   the dataset verifiable and retaining raw content privately for law enforcement.
4. **Anchoring** — anchor the cryptographic root to external public infra (GitHub /
   blockchain) so anyone can verify the public data, with redacted entries represented
   only by a hash, **without trusting our server**.

See **[FINDINGS.md](./FINDINGS.md)** for results and the architecture write-up.

## Architecture in one picture

```
            PUBLIC, append-only (immudb)            PRIVATE, mutable (Postgres)
            ───────────────────────────             ───────────────────────────
 append --> post:<id> -> { …, contentHash }   <-->  raw_content(id, salt, content)
            comment:<id> -> { …, contentHash }      users(id, handle, email)
            vote:<id> -> { …, contentHash }         keys(id, user_id, pubkey, privkey)
                   │                                         │
                   │ currentState root                      │ redact() / erase()
                   ▼                                         ▼
            export bundle (envelopes + Merkle proofs) ── anchor (GitHub + EVM)
                   │
                   ▼
            offline independent verifier  (trusts only the anchored root)
```

- immudb stores **only hash commitments** + public metadata. It is the append-only
  authority. Its root hash is anchored.
- Postgres holds **raw content + salt + PII**. It is mutable, so redaction and true
  erasure are physically possible (immudb can never delete).
- A published **bundle** carries envelopes + app-level Merkle proofs; an **offline
  verifier** checks them against an externally-anchored root.

## Prerequisites

- Docker + Docker Compose
- Node ≥ 20 (repo is an npm-workspaces monorepo; run `npm install` at the repo root)

## Run

```bash
# from the repo root
npm install

# bring up immudb (public ledger) + postgres (private store)
npm run db:up --workspace immudb-test

# deterministic suite (20 tests, CI-safe)
npm run test:unit --workspace immudb-test

# OPTIONAL: real on-disk corruption demo (slow, non-deterministic, rebuilds the volume)
npm run test:physical --workspace immudb-test

# tear everything down (also wipes volumes)
npm run db:down --workspace immudb-test
```

No `.env` is required — defaults match `docker-compose.yml`. See `.env.example` to override.

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | immudb **1.1.0** (gRPC baseline) + immudb **1.11.0** (pg-wire) + postgres 16 |
| `src/commitment.ts` | canonical JSON + salted SHA-256 content commitment |
| `src/merkle.ts` | RFC-6962-style Merkle tree (root, proof, verify) |
| `src/immudb.ts` | typed wrapper over `immudb-node`; root read + trusted-state helpers |
| `src/privateStore.ts` | Postgres store with `redact()` / `erase()` |
| `src/ledger.ts` | `append()` (commitment → immudb, raw → Postgres) |
| `src/export.ts` | build the publishable audit bundle |
| `src/verifier.ts` | **offline** independent auditor |
| `src/anchor-github.ts` / `src/anchor-evm.ts` | the two anchoring paths |
| `src/immudb-pg.ts` | **immudb 1.11.0 over pg-wire** — the modern path; `immudb_state()` / `immudb_verify_row()` |
| `test/*.spec.ts` | nine suites (01–08 gRPC baseline; 09 `@pgwire`; 04 is `@physical`, opt-in) |

> **gRPC 1.1.0 vs pg-wire 1.11.0.** Suites 01–08 use the legacy `immudb-node` gRPC client,
> which only verifies against immudb ≤ 1.1.x — kept as a baseline. Suite 09 is the recommended
> path: the latest server (1.11.0) over the Postgres wire protocol with a maintained `pg`
> client and native SQL verification. See **FINDINGS.md §5**.
