# @oursay/evm-anchor

Hardhat workspace for **EVM anchoring** of public-record settlement blocks. Multi-chain (per jurisdiction), owner-only writes, forkable tips with on-chain justification.

## Contract: `SettlementAnchor`

Minimal append input → contract infers height (`tip+1`), `prevBlockRoot` / `prevChainTipHash` / `prevAnchorHash` (zeros at genesis), and `chainTipHash`. Caller must supply a `headerHash` that matches the reconstructed header or the tx reverts.

| Concern | Behavior |
|---------|----------|
| Tip fold | `keccak256(abi.encode(prevChainTipHash, bundleMerkleRoot))` — EVM scheme; not byte-identical to off-chain `sha256(canonicalJson(...))` |
| Storage | Seq range, txCount, bundleMerkleRoot, immudb witness, tip, headerHash, capturedAt — not prev* |
| Forks | `forkChain(source, atHeight, atBlockHash, newChainId, reason)` — pre-fork heights resolve via parent |
| Auth | OpenZeppelin `Ownable` — create / append / fork are owner-only |

## Run

```powershell
npm test -w @oursay/evm-anchor
npm run test:solidity -w @oursay/evm-anchor
npm run test:mocha -w @oursay/evm-anchor
```

Compiled with solc 0.8.28, no optimizer / viaIR.
