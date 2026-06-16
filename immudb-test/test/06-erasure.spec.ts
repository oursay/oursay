import { expect } from "chai";
import { getWorld } from "./helpers/world.js";
import { buildBundle } from "../src/export.js";
import { verifyBundle } from "../src/verifier.js";

/**
 * TRUE ERASURE (right-to-be-forgotten): physically destroy the plaintext + salt in the
 * private store. The immutable ledger commitment survives as a tombstone — the content
 * can never be revealed or re-proved again, but the rest of the dataset stays verifiable.
 */
describe("06 erasure: destroy plaintext, keep the tombstone", () => {
  it("erased content is gone, yet the ledger and other proofs are intact", async () => {
    const { immu, ledger, priv } = await getWorld();

    const survivor = await ledger.append({ type: "post", authorRef: "alice", content: { text: "stays public" } });
    const target = await ledger.append({ type: "comment", authorRef: "bob", content: { text: "must be erased" } });

    await priv.erase(target.id);

    // Plaintext is physically gone from the private store.
    const c = await priv.getContent(target.id);
    expect(c, "tombstone row remains").to.exist;
    expect(c!.content, "content destroyed").to.equal(null);
    expect(c!.salt, "salt destroyed").to.equal(null);
    expect(c!.erasedAt, "erasure timestamped").to.not.equal(null);

    // The ledger commitment is unchanged; the bundle still verifies.
    const env = await ledger.get(target.key);
    expect(env.contentHash).to.match(/^[0-9a-f]{64}$/);

    const bundle = await buildBundle(immu, priv, [survivor.key, target.key]);
    const report = verifyBundle(bundle, bundle.anchor.bundleMerkleRoot);
    expect(report.ok, "dataset verifies after erasure").to.equal(true);

    const erased = bundle.entries.find((e) => e.envelope.id === target.id)!;
    expect(erased.reveal, "no plaintext for erased entry").to.equal(undefined);
    expect(report.verdicts.find((v) => v.id === target.id)!.status).to.equal("redacted");
  });
});
