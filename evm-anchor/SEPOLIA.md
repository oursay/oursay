# Deploy SettlementAnchor to Sepolia and wire the public-record worker

This guide takes the local Hardhat flow (`npm run dev:up -w @oursay/evm-anchor`) and points the same `EvmAnchorTarget` / settlement worker at **Ethereum Sepolia** (chain id `11155111`).

## What you need

| Item | Notes |
|------|--------|
| Sepolia ETH | Deployer + worker signer must pay gas. Use a faucet (e.g. Alchemy / Infura / public faucets). |
| RPC URL | HTTPS JSON-RPC (Alchemy, Infura, QuickNode, public Sepolia endpoint). |
| Deployer key | Owns the contract (`Ownable`). **Never** use Hardhat account `#0`. |
| Worker key | Must be the **owner** (same key as deployer, or transfer ownership after deploy). |
| Synced ABI | `npm run sync:abi -w @oursay/evm-anchor` after any contract change. |

`hardhat.config.ts` already defines a `sepolia` network using Hardhat `configVariable`s `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` (for Hardhat tasks). The deploy script and worker use ordinary process env (below).

## 1. Compile and sync ABI

```powershell
npm run sync:abi -w @oursay/evm-anchor
```

This compiles `SettlementAnchor` and copies the ABI into `public-record/src/anchor/abi/SettlementAnchor.json`.

## 2. Deploy to Sepolia

Set secrets in the shell (do not commit them):

```powershell
$env:SEPOLIA_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>"
$env:SEPOLIA_PRIVATE_KEY = "0x..."   # funded deployer; becomes contract owner
npm run deploy:sepolia -w @oursay/evm-anchor
```

The script writes the address to `evm-anchor/.evm/sepolia.address` (gitignored under `.evm/`).

Confirm on a Sepolia explorer (Etherscan Sepolia) that the contract is created and the deployer is `owner()`.

Optional: verify source on Etherscan (API key + Hardhat verify / manual paste) — not required for the worker.

## 3. Point public-record at Sepolia

In `public-record/.env` (or the worker container env), **replace** local Hardhat defaults:

```env
EVM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
EVM_CHAIN_ID=11155111
EVM_CONTRACT_ADDRESS=0x<address from sepolia.address>
EVM_ANCHOR_PRIVATE_KEY=0x...   # must be contract owner
EVM_ANCHOR_EVERY_BLOCKS=2
```

Notes:

- `EVM_CHAIN_ID` is the **EVM network id** for ethers (`11155111`), not a civic id like `ab-ca-gov`.
- Civic chains (`WORKER_CHAIN_IDS`, e.g. `ab-ca-gov`) are still mapped on-chain with `ethers.id(string)`.
- Do **not** leave `EVM_RPC_URL=http://127.0.0.1:8545` or a host Hardhat process on `:8545` if you intend Sepolia — a leftover local node was a common footgun in local testing.
- Compose worker reads the same `EVM_*` from `public-record/.env` (`EVM_CONTRACT_ADDRESS` wins over the address file). Recreate the worker after changing that file (`docker compose … up -d --force-recreate worker`, or `npm run up -w @oursay/api`). If `EVM_RPC_URL` is unset, compose still defaults to `host.docker.internal:8545` for local Hardhat.

## 4. Run the stack

```powershell
# public-record DBs (immudb + postgres)
npm run db:up -w @oursay/public-record

# optional: seed enough txs for 2 settlement blocks (EVM cadence default = 2)
npm run seed -w @oursay/api

# worker (host) — picks up public-record/.env
npm run worker -w @oursay/public-record
```

On startup the worker runs `catchUp` per target:

- Empty Sepolia tip + settled platform headers → one `appendBlocks` batch (or cadence-sized gaps later).
- Tip height H > 0 → integrity check: on-chain `bundleMerkleRoot` at H must match immudb `record_blocks` at H; mismatch throws `AnchorIntegrityError` (no silent rewrite).

First publish for each civic chain id calls `createChain` on-chain (owner only).

## 5. Sanity checks

```powershell
# Tip / headers (replace address + RPC)
npx tsx public-record/scripts/manual-evm-publish.ts
# (with Sepolia env set this catch-up-publishes any gap; or read-only via cast/ethers)

# Compare immudb headers to chain (same fields as local verify):
# block_height, from_seq, to_seq, tx_count, bundle_merkle_root, chain_tip_hash, immudb witness
```

Explorer: open the contract, confirm `getChainStats(ethers.id("ab-ca-gov"))` tip height advances after the worker publishes.

## Ops differences vs local Hardhat

| | Local Hardhat | Sepolia |
|--|---------------|---------|
| Persistence | Wiped every container restart | Durable |
| Deploy | Every `dev:up` | Once (keep address) |
| After redeploy | Restart worker → full catch-up | Rare; new address = new tip 0 catch-up |
| Integrity | Easy to desync if worker outlives node | Mismatch is real; use `fork:chain` or new contract |
| Keys | Well-known Hardhat `#0` OK | Real funded key; treat as secret |
| Gas | Free | Need Sepolia ETH |

Fork recovery (explicit, not automatic):

```powershell
$env:EVM_RPC_URL = $env:SEPOLIA_RPC_URL
$env:EVM_PRIVATE_KEY = $env:SEPOLIA_PRIVATE_KEY
$env:EVM_ANCHOR_ADDRESS = "0x..."
$env:FORK_SOURCE_CHAIN_ID = "ab-ca-gov"
$env:FORK_AT_HEIGHT = "1"
$env:FORK_NEW_CHAIN_ID = "ab-ca-gov-fork"
$env:FORK_REASON = "repair after integrity mismatch"
npm run fork:chain -w @oursay/evm-anchor
```

## Security checklist

- [ ] Deployer / worker private key is **not** Hardhat `#0` and not committed.
- [ ] RPC URL keys stay in env / secret store.
- [ ] Only the owner key can `appendBlocks` / `createChain` / `forkChain`.
- [ ] Production mainnet is a separate decision (gas, key custody, monitoring) — this doc is Sepolia-only.
