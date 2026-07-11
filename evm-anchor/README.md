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

## Run

```powershell
npm test -w @oursay/evm-anchor
npm run node -w @oursay/evm-anchor   # JSON-RPC (compose uses this)
npm run deploy:local -w @oursay/evm-anchor
```

Compiled with solc 0.8.28, no optimizer / viaIR.
