# immudb — database per jurisdiction

_Design for jurisdiction isolation on a shared immudb instance. Supersedes the interim "one shared `defaultdb`, many `chainId` columns" shortcut recorded in doc 07 §5 and `public-record` README / `ledger.sql.ts`._

## Model

| Identifier | Shape | Example | Role |
|---|---|---|---|
| **`ledgerId`** | UUID | `550e8400-e29b-41d4-a716-446655440000` | One **immudb instance**; one external anchor (EVM) contract |
| **`chainId`** | slug | `ab-ca-gov` | One **jurisdiction** / public-record chain (unchanged product surface) |
| **immudb database name** | snake_case(slug) | `ab_ca_gov` | Physical store + independent Merkle / `immudb_state()` root |

- **Add jurisdiction** → `CREATE DATABASE` for the snake_case name; run ledger DDL; write a genesis meta row binding `ledgerId` + `chainId`; optionally `createChain` on the EVM contract.
- **Remove jurisdiction** → drop/unload **that database only**; sibling DBs' roots stay valid. Postgres content for the chain remains erasable via `erase()` (private store is still shared).
- **Fork** → new slug `chainId` → new database + recorded lineage + EVM `forkChain`. Full historical immudb row replay into the new DB is a follow-up; this loop records lineage and continues fresh.

```
immudb instance (= ledgerId UUID) ── 1× SettlementAnchor contract
  ├── db oursay_global  (chainId oursay-global) ── own Merkle root
  ├── db ab_ca_gov      (chainId ab-ca-gov)      ── own Merkle root
  └── …
Postgres (shared) ── record_tx / outbox / content (erase still works)
```

## `ledgerId` — config + tamper-evident row

- Env: `LEDGER_ID` must be a UUID. Set once per deployment; never change for that instance.
- **Not** embedded in the per-block hashed header / `SettlementAnchor` `HeaderFields` (constant per contract; would force a Solidity + header-hash change for no verification gain). `immudbRoot.db` already carries the per-jurisdiction database name into headers and anchors.
- **Tamper-evident bind:** write `ledgerId` once as an append-only genesis/meta row in each jurisdiction database so the binding is verified like other commitments — not only inferred from anchors/config.

## Immudb capabilities (1.11.0, pg-wire)

| Operation | Status |
|---|---|
| `CREATE DATABASE` | Supported |
| `USE DATABASE` (in-session) | Supported |
| Connect with `database=` | Supported (reconnect path) |
| Drop/unload database | Confirm at build; may need `immuadmin` / unload + archive dir |

Default open-file limits allow on the order of ~250 databases per process; raise `LimitNOFILE` for large fleets. Tests must drop per-run databases at teardown.

## Out of scope this loop

- Splitting the private Postgres store per jurisdiction.
- Migrating historical rows out of a shared `defaultdb` (greenfield: re-seed).
- Putting `ledgerId` into the on-chain header hash.

## Related

- [`FINDINGS.md`](./FINDINGS.md) — commitments-only immudb; pg-wire path.
- [`07-DECENTRALIZATION-ALIGNMENT.md`](../../07-DECENTRALIZATION-ALIGNMENT.md) §5.
- [`GLOSSARY.md`](../../GLOSSARY.md) — `ledgerId`, jurisdiction ↔ chain.
