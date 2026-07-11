/**
 * Explicit ops recovery: fork an on-chain settlement chain at a known-good height.
 * Does NOT run from the worker — integrity failures must be repaired deliberately.
 *
 *   npm run fork:chain -w @oursay/evm-anchor
 *
 * Env:
 *   EVM_RPC_URL            (default http://127.0.0.1:8545)
 *   EVM_PRIVATE_KEY        (default Hardhat account #0)
 *   EVM_ANCHOR_ADDRESS     (default public-record/.evm/address)
 *   FORK_SOURCE_CHAIN_ID   public-record string id (e.g. ab-ca-gov) — mapped via ethers.id
 *   FORK_AT_HEIGHT         last good height (uint64)
 *   FORK_NEW_CHAIN_ID      new public-record string id for the fork
 *   FORK_REASON            non-empty reason string (required by the contract)
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, id as ethersId, type InterfaceAbi } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "..");
const artifactPath = join(
  packageRoot,
  "artifacts",
  "contracts",
  "SettlementAnchor.sol",
  "SettlementAnchor.json",
);
const defaultAddressFile = join(repoRoot, "public-record", ".evm", "address");

const rpcUrl = process.env.EVM_RPC_URL?.trim() || "http://127.0.0.1:8545";
const privateKey =
  process.env.EVM_PRIVATE_KEY?.trim() ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[fork] missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

function resolveContractAddress(): string {
  const fromEnv = process.env.EVM_ANCHOR_ADDRESS?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(defaultAddressFile, "utf8").trim();
  } catch {
    console.error(
      `[fork] set EVM_ANCHOR_ADDRESS or write an address to ${defaultAddressFile}`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const sourceChainId = requireEnv("FORK_SOURCE_CHAIN_ID");
  const newChainId = requireEnv("FORK_NEW_CHAIN_ID");
  const reason = requireEnv("FORK_REASON");
  const atHeightRaw = requireEnv("FORK_AT_HEIGHT");
  const atHeight = BigInt(atHeightRaw);
  if (atHeight <= 0n) {
    console.error("[fork] FORK_AT_HEIGHT must be > 0");
    process.exit(1);
  }

  const address = resolveContractAddress();
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: InterfaceAbi };
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(address, artifact.abi, wallet);

  const sourceBytes = ethersId(sourceChainId);
  const newBytes = ethersId(newChainId);

  const block = await contract.getBlock(sourceBytes, atHeight);
  const atBlockHash = block.bundleMerkleRoot as string;

  console.log(
    `[fork] forking ${sourceChainId} (${sourceBytes}) at height ${atHeight} ` +
      `→ ${newChainId} (${newBytes}) reason=${JSON.stringify(reason)}`,
  );
  console.log(`[fork] atBlockHash (bundleMerkleRoot)=${atBlockHash}`);
  console.log(`[fork] contract=${address} via ${rpcUrl} as ${wallet.address}`);

  const tx = await contract.forkChain(sourceBytes, atHeight, atBlockHash, newBytes, reason);
  const receipt = await tx.wait();
  console.log(`[fork] ChainForked in tx ${receipt?.hash ?? tx.hash}`);
  console.log(
    "[fork] next: point the worker at the new chain id (or redeploy + catch-up), then restart the worker",
  );
}

main().catch((err) => {
  console.error("[fork] fatal:", err);
  process.exit(1);
});
