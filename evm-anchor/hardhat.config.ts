import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// const account = new ethers.Wallet(configVariable("EVM_ANCHOR_PRIVATE_KEY"));
// console.log("account", account.address);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    // Persistent local Hardhat node (`npm run node`).
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Any remote chain via EVM_* env (Sepolia, mainnet, etc.).
    evm: {
      type: "http",
      chainType: "l1",
      url: configVariable("EVM_RPC_URL"),
      accounts: [configVariable("EVM_ANCHOR_PRIVATE_KEY")!],
    },
  },
});
