# @oursay/evm-anchor

Hardhat workspace for **EVM anchoring** of public-record settlement blocks.

## Contract: `SettlementAnchor`

Minimal append (`toSeq`, roots, immudb witness, `capturedAt`, `headerHash`) → contract infers height, `fromSeq` / `txCount`, prev links, and tip.

| Concern | Behavior |
|---------|----------|
| Tip fold | `sha256(abi.encodePacked(prevTip, bundleMerkleRoot))` — same as public-record Option 1 |
| Header | `sha256(abi.encode(HeaderFields))` |
| Storage | `toSeq`, roots, immudb, tip, headerHash, capturedAt |
| Forks | `forkChain(..., reason)` — pre-fork heights resolve via parent |
| Auth | OpenZeppelin `Ownable` |

## Local node (dev)

One compose command starts Hardhat and deploys a fresh `SettlementAnchor` (address → `evm-anchor/.evm/address`):

```powershell
npm run dev:up -w @oursay/evm-anchor
npm run dev:down -w @oursay/evm-anchor
```

Host-only (no Docker):

```powershell
npm run node -w @oursay/evm-anchor   # terminal 1
npm run deploy:local -w @oursay/evm-anchor
```

After contract changes, refresh the ABI copy used by public-record:

```powershell
npm run sync:abi -w @oursay/evm-anchor
```

Compiled with solc 0.8.28, no optimizer / viaIR.

## Sepolia

See **[SEPOLIA.md](./SEPOLIA.md)** — deploy `SettlementAnchor`, set `EVM_*` on public-record, run the worker against chain id `11155111`.

```powershell
$env:SEPOLIA_RPC_URL = "https://..."
$env:SEPOLIA_PRIVATE_KEY = "0x..."
npm run deploy:sepolia -w @oursay/evm-anchor
```

## Create civic chains on-chain

Owner-only `createChain` (string ids → `ethers.id`). The worker also creates a chain on first publish; use this to set them up ahead of time:

```powershell
npm run create:chain -w @oursay/evm-anchor -- ab-ca-gov oursay-global
npm run create:chain -w @oursay/evm-anchor -- --dry-run ab-ca-gov
```

Uses `EVM_RPC_URL` / `EVM_CONTRACT_ADDRESS` / `EVM_ANCHOR_PRIVATE_KEY` (or `--rpc` / `--address` / `--private-key`).

## Catch-up and integrity (ops)

Hardhat’s in-memory chain is wiped on every `evm` restart; each deploy writes a **fresh** contract while immudb keeps settled blocks. The settlement worker runs `catchUp` once per target on startup: if the target tip is empty it republishes all settled headers; if tip height H > 0 it compares `bundleMerkleRoot` at H to the platform header and throws `AnchorIntegrityError` on mismatch (no silent rewrite, no auto-fork).

After wipe + redeploy, **restart the worker** so catch-up sees tip height 0 and restores the on-chain tip.

### Fork recovery (explicit)

If integrity fails at height H, fork at the last **good** height (do not auto-fork from the worker):

```powershell
$env:FORK_SOURCE_CHAIN_ID = "ab-ca-gov"
$env:FORK_AT_HEIGHT = "1"
$env:FORK_NEW_CHAIN_ID = "ab-ca-gov-fork"
$env:FORK_REASON = "repair after integrity mismatch"
npm run fork:chain -w @oursay/evm-anchor
```

String chain ids are mapped on-chain with `ethers.id` (keccak256 of UTF-8). File targets: wipe or restore from a known-good snapshot, then restart the worker for catch-up.
