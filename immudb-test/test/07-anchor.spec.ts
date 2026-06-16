import { join } from "node:path";
import { rmSync } from "node:fs";
import { expect } from "chai";
import { getWorld } from "./helpers/world.js";
import { buildBundle } from "../src/export.js";
import { paths } from "../src/config.js";
import { anchorTagName, appendAnchorFile, readLatestAnchoredRoot } from "../src/anchor-github.js";
import { randomPrivKey, recoverAnchorSigner, signAnchor } from "../src/anchor-evm.js";

/**
 * ANCHORING: publish the root to external public infrastructure so third parties can
 * verify without trusting our server. Two paths:
 *   (a) GitHub — append the anchor record to a public anchors.jsonl + tag the commit.
 *   (b) EVM    — an `anchor(bytes32)` tx signed offline (Turnkey-style) and recovered.
 */
describe("07 anchoring: GitHub artifact + EVM offline signature", () => {
  it("produces a stable GitHub anchor artifact and tag, then reads the root back", async () => {
    const { immu, priv, ledger } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "anchor target" } });
    const bundle = await buildBundle(immu, priv, [r.key]);

    const anchorsPath = join(paths.outDir, "anchors.jsonl");
    rmSync(anchorsPath, { force: true });
    appendAnchorFile(anchorsPath, bundle.anchor);

    // The tag binds immudb tx height and a short fingerprint of the bundle root.
    const tag = anchorTagName(bundle.anchor);
    expect(tag).to.match(/^anchor-tx\d+-[0-9a-f]{12}$/);

    // An auditor fetching the public file recovers the anchored Merkle root.
    expect(readLatestAnchoredRoot(anchorsPath)).to.equal(bundle.anchor.bundleMerkleRoot);
    expect(bundle.anchor.immudbRoot.txhashHex).to.match(/^[0-9a-f]{64}$/);
  });

  it("signs the anchor as an EVM anchor(bytes32) tx and recovers the signer (offline)", async () => {
    const { immu, priv, ledger } = await getWorld();
    const r = await ledger.append({ type: "poll", authorRef: "alice", content: { question: "q", options: ["a", "b"] } });
    const bundle = await buildBundle(immu, priv, [r.key]);

    const pk = randomPrivKey();
    const sig = signAnchor(bundle.anchor.bundleMerkleRoot, pk);

    // calldata = selector || 32-byte root; signature is recoverable.
    expect(sig.calldataHex.slice(0, 10)).to.match(/^0x[0-9a-f]{8}$/);
    expect(sig.calldataHex.length).to.equal(2 + 8 + 64); // 0x + selector + bytes32
    expect([27, 28]).to.include(sig.signature.v);

    const recovered = recoverAnchorSigner(sig.digestHex, sig.signature);
    expect(recovered.toLowerCase()).to.equal(sig.address.toLowerCase());
  });
});
