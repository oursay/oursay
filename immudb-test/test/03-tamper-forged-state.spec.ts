import { expect } from "chai";
import { getWorld, rejects } from "./helpers/world.js";
import { forgeTrustedRoot, restoreTrustedState, snapshotTrustedState } from "../src/immudb.js";

/**
 * Deterministic, CI-friendly tamper demonstration. immudb verifies every read against
 * the client's TRUSTED ROOT. If that trusted anchor disagrees with the server's history
 * — which is exactly what happens if a server tries to serve a forged/rewritten history,
 * or if the anchor itself was tampered — verification fails hard. We simulate the
 * divergence by corrupting the locally-held trusted root hash.
 */
describe("03 tamper detection: forged trusted root (deterministic)", () => {
  it("verifiedGet REJECTS when the trusted root hash is forged", async () => {
    const { immu, ledger } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "anchor me" } });

    // Baseline: a verified read succeeds against the honest trusted root.
    await ledger.get(r.key);

    const snap = snapshotTrustedState(immu);
    try {
      forgeTrustedRoot(immu); // flip a byte in the trusted root hash
      const detected = await rejects(immu.verifiedGet({ key: r.key }));
      expect(detected, "verifiedGet should reject against a forged trusted root").to.equal(true);
    } finally {
      restoreTrustedState(immu, snap);
    }

    // After restoring the honest root, verification works again.
    const env = await ledger.get(r.key);
    expect(env.id).to.equal(r.id);
  });
});
