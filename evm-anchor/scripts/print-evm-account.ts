/**
 * Sanity-check that Hardhat resolves EVM_* configVariables for --network evm.
 * Prints the configured account address (never the private key).
 *
 *   npx hardhat run scripts/print-evm-account.ts --network evm
 */
import { network } from "hardhat";

const { ethers, networkName, networkConfig } = await network.create({
  network: "evm",
});

const [signer] = await ethers.getSigners();
const net = await ethers.provider.getNetwork();

const url =
  typeof networkConfig === "object" &&
  networkConfig !== null &&
  "url" in networkConfig
    ? String((networkConfig as { url?: unknown }).url)
    : "(unknown)";

console.log(`[print-evm-account] networkName=${networkName}`);
console.log(`[print-evm-account] config.url=${url}`);
console.log(`[print-evm-account] config.chainId=${(networkConfig as { chainId?: number }).chainId ?? "(unset)"}`);
console.log(`[print-evm-account] provider.chainId=${net.chainId}`);
console.log(`[print-evm-account] account=${signer?.address ?? "(none)"}`);
