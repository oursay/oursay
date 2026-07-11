/**
 * Copy SettlementAnchor ABI from Hardhat artifacts into public-record for EvmAnchorTarget.
 *
 *   npm run sync:abi -w @oursay/evm-anchor
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const outDir = join(repoRoot, "public-record", "src", "anchor", "abi");
const outFile = join(outDir, "SettlementAnchor.json");

const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown };
if (!Array.isArray(artifact.abi)) {
  console.error(`[sync-abi] expected artifact.abi array at ${artifactPath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(artifact.abi, null, 2)}\n`);
console.log(`[sync-abi] wrote ${outFile} (${artifact.abi.length} fragments)`);
