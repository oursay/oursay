import { expect } from "chai";
import { getWorld } from "./helpers/world.js";
import { readRoot } from "../src/immudb.js";

describe("02 verified proofs: immudb's happy-path cryptographic guarantees", () => {
  it("verifiedSet then verifiedGet round-trips with proof verification", async () => {
    const { ledger } = await getWorld();
    const r = await ledger.append({ type: "post", authorRef: "alice", content: { text: "hello proofs" } });
    // ledger.get() uses verifiedGet under the hood; reaching here means proofs verified.
    const env = await ledger.get(r.key);
    expect(env.id).to.equal(r.id);
  });

  it("accepts a consistency proof across time (append-only T1 -> T2)", async () => {
    const { immu, ledger } = await getWorld();
    const a = await ledger.append({ type: "comment", authorRef: "bob", content: { text: "t1" } });
    const t1 = await readRoot(immu);

    await ledger.append({ type: "comment", authorRef: "bob", content: { text: "t2a" } });
    await ledger.append({ type: "comment", authorRef: "bob", content: { text: "t2b" } });
    const t2 = await readRoot(immu);

    // The ledger only grew; the later root is at a higher tx height.
    expect(t2.txid).to.be.greaterThan(t1.txid);

    // A verified read of the older entry still verifies against the advanced root —
    // immudb proves the new state is consistent with (a superset of) the old one.
    const env = await ledger.get(a.key);
    expect(env.id).to.equal(a.id);
  });

  it("exposes a cryptographic root (txid + 32-byte txhash) to anchor", async () => {
    const { immu } = await getWorld();
    const root = await readRoot(immu);
    expect(root.txid).to.be.greaterThan(0);
    expect(root.txhashHex).to.match(/^[0-9a-f]{64}$/);
  });
});
