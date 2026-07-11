/**
 * Copy SettlementAnchor address from Ignition artifacts into .evm/address
 * (consumed by public-record worker / docker compose).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentsDir = join(packageRoot, "ignition", "deployments");
const outFile = join(packageRoot, ".evm", "address");

const KEY = "SettlementAnchorModule#SettlementAnchor";

function main(): void {
  if (!existsSync(deploymentsDir)) {
    console.error("[write-address] no ignition/deployments — deploy first");
    process.exit(1);
  }

  const candidates = readdirSync(deploymentsDir)
    .filter((d) => d.startsWith("chain-"))
    .map((id) => join(deploymentsDir, id, "deployed_addresses.json"))
    .filter((f) => existsSync(f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  if (candidates.length === 0) {
    console.error("[write-address] no deployed_addresses.json found");
    process.exit(1);
  }

  const addresses = JSON.parse(readFileSync(candidates[0], "utf8")) as Record<string, string>;
  const address = addresses[KEY];
  if (!address) {
    console.error(`[write-address] missing ${KEY} in ${candidates[0]}`);
    process.exit(1);
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, address + "\n");
  console.log(`[write-address] ${address} → ${outFile}`);
}

main();
