# immudb — database per jurisdiction

_Design for jurisdiction isolation on a shared immudb instance. Supersedes the interim "one shared `defaultdb`, many `chainId` columns" shortcut recorded in doc 07 §5 and `public-record` README / `ledger.sql.ts`._

## Model

| Identifier | Shape | Example | Role |
|---|---|---|---|
| **`ledgerId`** | UUID | `550e8400-e29b-41d4-a716-446655440000` | One **immudb instance**; one external anchor (EVM) contract |
| **`chainId`** | slug | `ab-ca-gov` | One **jurisdiction** / public-record chain (unchanged product surface) |
| **immudb database name** | `j_` + snake_case(slug) | `j_ab_ca_gov` | Physical store + independent Merkle / `immudb_state()` root |

- **Add jurisdiction** → `CREATE DATABASE` for the `j_`+snake_case name; run ledger DDL; write a genesis meta row binding `ledgerId` + `chainId`; optionally `createChain` on the EVM contract.
- **Remove jurisdiction** → drop/unload **that database only**; sibling DBs' roots stay valid. Postgres content for the chain remains erasable via `erase()` (private store is still shared).
- **Fork** → new slug `chainId` → new database + recorded lineage + EVM `forkChain`. Full historical immudb row replay into the new DB is a follow-up; this loop records lineage and continues fresh.

```
immudb instance (= ledgerId UUID) ── 1× SettlementAnchor contract
  ├── db j_oursay_global  (chainId oursay-global) ── own Merkle root
  ├── db j_ab_ca_gov      (chainId ab-ca-gov)      ── own Merkle root
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
| Drop/unload database | **pg-wire `DROP DATABASE` unsupported** on 1.11.0 (test logs confirm); production remove path may need `immuadmin` unload + archive. Closing the pg client still releases active snapshots so suites stay under the tbtree snapshot limit. |

## Limits (immudb 1.11.0 defaults)

Two separate ceilings (source: `DefaultMaxActiveSnapshots` / `MaxActiveDatabases` in the immudb tree — both default to **100**):

| Limit | Default | What it gates |
|---|---|---|
| **`MaxActiveSnapshots`** (per-DB tbtree indexer) | **100** | Concurrent in-memory btree snapshots. Hit as `tbtree: max active snapshots limit reached`. |
| **`MaxActiveDatabases`** | **100** | How many databases the server keeps open at once (LRU unload beyond that). |

What we hit in practice: the **snapshot** limit, not “database count on disk.” Leaving one long-lived pg-wire client per jurisdiction DB holds snapshots open; before reclaim, the public-record mocha run stacked ≈40+ open connectors by suite 14 and `CREATE DATABASE` failed with the snapshot error. Closing clients (test `releaseEphemeralChains` / `reclaimChains`) frees the budget even when `DROP DATABASE` is unsupported. Raising either knob (or `LimitNOFILE` for large on-disk fleets) is an ops choice; product scale for jurisdictions is well under 100 concurrent open DBs if connections are pooled and released.

## Out of scope this loop

- Splitting the private Postgres store per jurisdiction.
- Migrating historical rows out of a shared `defaultdb` (greenfield: re-seed).
- Putting `ledgerId` into the on-chain header hash.

## Related

- [`FINDINGS.md`](./FINDINGS.md) — commitments-only immudb; pg-wire path.
- [`07-DECENTRALIZATION-ALIGNMENT.md`](../../07-DECENTRALIZATION-ALIGNMENT.md) §5.
- [`GLOSSARY.md`](../../GLOSSARY.md) — `ledgerId`, jurisdiction ↔ chain.
