/**
 * Create one or more civic chains on SettlementAnchor (owner-only `createChain`).
 * String ids are mapped with `ethers.id` (same as the public-record worker).
 *
 *   npm run create:chain -w @oursay/evm-anchor -- ab-ca-gov oursay-global
 *   npm run create:chain -w @oursay/evm-anchor -- --dry-run ab-ca-gov
 *
 * Options (override env):
 *   --rpc <url>            JSON-RPC (env EVM_RPC_URL)
 *   --address <addr>       SettlementAnchor (env EVM_CONTRACT_ADDRESS / EVM_ANCHOR_ADDRESS)
 *   --private-key <key>    Owner key (env EVM_ANCHOR_PRIVATE_KEY / EVM_PRIVATE_KEY)
 *   --dry-run              Print id → bytes32 only; no txs
 *   -h, --help
 *
 * Env defaults: EVM_RPC_URL=http://127.0.0.1:8545, Hardhat account #0, address from
 * evm-anchor/.evm/address (or .evm/sepolia.address).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, id as ethersId, type InterfaceAbi } from "ethers";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const artifactPath = join(
  packageRoot,
  "artifacts",
  "contracts",
  "SettlementAnchor.sol",
  "SettlementAnchor.json",
);
const defaultAddressFile = join(packageRoot, ".evm", "address");
const sepoliaAddressFile = join(packageRoot, ".evm", "sepolia.address");

interface Args {
  chainIds: string[];
  rpcUrl?: string;
  address?: string;
  privateKey?: string;
  dryRun: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`Usage: create-chain [options] <chainId> [chainId...]

Create civic chain id(s) on SettlementAnchor (ethers.id mapping).

Options:
  --rpc <url>           JSON-RPC endpoint
  --address <addr>      SettlementAnchor address
  --private-key <key>   Contract owner private key
  --dry-run             Show mappings only; do not send txs
  -h, --help            Show this help

Examples:
  npm run create:chain -w @oursay/evm-anchor -- ab-ca-gov
  npm run create:chain -w @oursay/evm-anchor -- ab-ca-gov oursay-global
  npm run create:chain -w @oursay/evm-anchor -- --dry-run ab-ca-gov`);
}

function parseArgs(argv: string[]): Args {
  const out: Args = { chainIds: [], dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      out.help = true;
    } else if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--rpc") {
      out.rpcUrl = argv[++i]?.trim();
      if (!out.rpcUrl) throw new Error("--rpc requires a value");
    } else if (a === "--address") {
      out.address = argv[++i]?.trim();
      if (!out.address) throw new Error("--address requires a value");
    } else if (a === "--private-key") {
      out.privateKey = argv[++i]?.trim();
      if (!out.privateKey) throw new Error("--private-key requires a value");
    } else if (a.startsWith("-")) {
      throw new Error(`unknown option: ${a}`);
    } else {
      out.chainIds.push(a);
    }
  }
  return out;
}

function resolveContractAddress(cli?: string): string {
  if (cli) return cli;
  const fromEnv =
    process.env.EVM_CONTRACT_ADDRESS?.trim() || process.env.EVM_ANCHOR_ADDRESS?.trim();
  if (fromEnv) return fromEnv;
  for (const file of [defaultAddressFile, sepoliaAddressFile]) {
    if (existsSync(file)) {
      const addr = readFileSync(file, "utf8").trim();
      if (addr) return addr;
    }
  }
  console.error(
    `[create-chain] set --address / EVM_CONTRACT_ADDRESS or write ${defaultAddressFile}`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[create-chain] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }
  if (args.chainIds.length === 0) {
    printHelp();
    console.error("\n[create-chain] at least one <chainId> is required");
    process.exit(1);
  }

  const rpcUrl =
    args.rpcUrl || process.env.EVM_RPC_URL?.trim() || "http://127.0.0.1:8545";
  const privateKey =
    args.privateKey ||
    process.env.EVM_ANCHOR_PRIVATE_KEY?.trim() ||
    process.env.EVM_PRIVATE_KEY?.trim() ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const address = resolveContractAddress(args.address);

  console.log(`[create-chain] contract=${address}`);
  console.log(`[create-chain] rpc=${rpcUrl}`);
  for (const chainId of args.chainIds) {
    console.log(`[create-chain]   ${chainId} → ${ethersId(chainId)}`);
  }

  if (args.dryRun) {
    console.log("[create-chain] dry-run — no txs sent");
    return;
  }

  if (!existsSync(artifactPath)) {
    console.error(`[create-chain] missing artifact — run: npm run compile -w @oursay/evm-anchor`);
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: InterfaceAbi };
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const contract = new Contract(address, artifact.abi, wallet);
  console.log(`[create-chain] signer=${wallet.address}`);

  for (const chainId of args.chainIds) {
    const bytes = ethersId(chainId);
    const stats = await contract.getChainStats(bytes);
    if (stats.exists) {
      console.log(
        `[create-chain] skip ${chainId} — already exists (tipHeight=${stats.tipHeight})`,
      );
      continue;
    }
    console.log(`[create-chain] creating ${chainId}…`);
    const tx = await contract.createChain(bytes);
    const receipt = await tx.wait();
    console.log(`[create-chain] ChainCreated ${chainId} tx=${receipt?.hash ?? tx.hash}`);
  }
}

main().catch((err) => {
  console.error("[create-chain] fatal:", err);
  process.exit(1);
});
