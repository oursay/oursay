/**
 * One-shot: publish settled platform headers 1..N to local SettlementAnchor.
 * Header-only — no Postgres required.
 *   npx tsx public-record/scripts/manual-evm-publish.ts
 */
import type { BundleAssembler } from "../src/anchor/assembler.js";
import { createEvmTargetsForChains } from "../src/anchor/evm.target.js";
import { AnchorPublisher } from "../src/anchor/publisher.js";
import { evmAnchorConfig } from "../src/config.js";
import { LedgerInstance } from "../src/ledger/instance.js";

const chainId = process.env.MANUAL_CHAIN_ID?.trim() || "ab-ca-gov";

async function main(): Promise<void> {
  console.log("[manual-evm] config", {
    chainId,
    ledgerId: evmAnchorConfig.ledgerId,
    rpcUrl: evmAnchorConfig.rpcUrl,
    contractAddress: evmAnchorConfig.contractAddress,
    networkChainId: evmAnchorConfig.networkChainId,
  });
  if (!evmAnchorConfig.contractAddress) {
    throw new Error("no EVM_CONTRACT_ADDRESS / address file — is evm-anchor dev:up running?");
  }

  const ledger = new LedgerInstance();
  await ledger.createDatabaseFor(chainId);
  const connector = await ledger.getConnector(chainId);

  const latest = await connector.fetchLatestBlock(chainId);
  console.log(
    "[manual-evm] platform tip",
    latest
      ? { height: latest.blockHeight, toSeq: latest.toSeq, root: latest.bundleMerkleRoot.slice(0, 16) }
      : null,
  );

  const [target] = createEvmTargetsForChains(
    [{ chainId, evmEveryNBlocks: 1 }],
    evmAnchorConfig,
  );
  if (!target) throw new Error("EVM target not created");

  const tip = await target.fetchLatestAnchor();
  console.log(
    "[manual-evm] evm tip before",
    tip ? { height: tip.blockHeight, toSeq: tip.toSeq, root: tip.bundleMerkleRoot.slice(0, 16) } : null,
  );

  // Header-only target never calls the assembler.
  const publisher = new AnchorPublisher(connector, null as unknown as BundleAssembler, chainId);
  const heights = await publisher.catchUp(target);
  console.log("[manual-evm] published heights", heights);

  const after = await target.fetchLatestAnchor();
  console.log(
    "[manual-evm] evm tip after",
    after
      ? { height: after.blockHeight, toSeq: after.toSeq, root: after.bundleMerkleRoot.slice(0, 16) }
      : null,
  );

  await ledger.close();
}

main().catch((err) => {
  console.error("[manual-evm] fatal:", err);
  process.exit(1);
});
