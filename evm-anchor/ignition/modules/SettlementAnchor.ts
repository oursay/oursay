import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Chain-agnostic SettlementAnchor deploy.
 * Owner = first account from the selected Hardhat network.
 *
 *   npx hardhat ignition deploy ./ignition/modules/SettlementAnchor.ts --network localhost
 *   npx hardhat ignition deploy ./ignition/modules/SettlementAnchor.ts --network evm
 */
export default buildModule("SettlementAnchorModule", (m) => {
  const owner = m.getAccount(0);
  const settlementAnchor = m.contract("SettlementAnchor", [owner]);
  return { settlementAnchor };
});
