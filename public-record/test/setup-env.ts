import "../../scripts/load-test-env.js";
import { releaseEphemeralChains, teardownWorld } from "./helpers/world.js";

/** Close per-test ephemeral immudb DBs; drop all at process end (snapshot / open-file ceiling). */
export const mochaHooks = {
  async afterEach() {
    await releaseEphemeralChains();
  },
  async afterAll() {
    await teardownWorld();
  },
};
