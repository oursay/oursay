/**
 * Deploy SettlementAnchor to a local Hardhat JSON-RPC node and write the address
 * to public-record/.evm/address (consumed by the settlement worker).
 *
 *   npm run deploy:local -w @oursay/evm-anchor
 *   EVM_RPC_URL=http://127.0.0.1:8545 npm run deploy:local -w @oursay/evm-anchor
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

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
const outDir = join(repoRoot, "public-record", ".evm");
const outFile = join(outDir, "address");

const rpcUrl = process.env.EVM_RPC_URL?.trim() || "http://127.0.0.1:8545";
const privateKey =
  process.env.EVM_PRIVATE_KEY?.trim() ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main(): Promise<void> {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi: unknown[];
    bytecode: string;
  };
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log(`[deploy] deploying SettlementAnchor from ${wallet.address} via ${rpcUrl}`);
  const contract = await factory.deploy(wallet.address);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, address + "\n");
  console.log(`[deploy] SettlementAnchor at ${address}`);
  console.log(`[deploy] wrote ${outFile}`);
}

main().catch((err) => {
  console.error("[deploy] fatal:", err);
  process.exit(1);
});
