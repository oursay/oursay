import { expect } from "chai";
import pg from "pg";
import { pgConfig } from "../src/config.js";
import { verifyEntityChain } from "../src/verify.js";
import { getWorld, settleAll } from "./helpers/world.js";

/** The per-entity hash chain + immudb commitments make tampering with the mutable store
 *  detectable, while still allowing true erasure (the chain verifies on hashes alone). */
describe("06 chain: verification, tamper detection, erasure", () => {
  it("verifies an entity's full create→update history (chain + immudb agree)", async () => {
    const { svc, store, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "v1" } });
    await svc.update({ entityId: post.entityId, author: "alice", content: { body: "v2" } });
    await settleAll(); // commitments reach immudb only at settlement

    const report = await verifyEntityChain(store, connector, post.entityId);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.verdicts).to.have.length(2);
    expect(report.verdicts.every((v) => v.ledgerAgrees && v.chainLinked && v.envelopeIntact)).to.equal(true);
  });

  it("detects tampering with raw content in the mutable store", async () => {
    const { svc, store, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "honest" } });
    await settleAll(); // commit the honest envelope to the chain before tampering Postgres

    // Tamper: rewrite the raw content in Postgres WITHOUT a new transaction / new commitment.
    const raw = new pg.Client(pgConfig);
    await raw.connect();
    await raw.query(`UPDATE record_tx SET content = '"tampered"'::jsonb WHERE tx_id = $1`, [post.txId]);
    await raw.end();

    const report = await verifyEntityChain(store, connector, post.entityId);
    expect(report.ok).to.equal(false);
    expect(report.verdicts[0].contentMatches).to.equal(false);
  });

  it("still verifies after true erasure (plaintext gone, chain intact on hashes alone)", async () => {
    const { svc, store, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "to be erased" } });
    await svc.update({ entityId: post.entityId, author: "alice", content: { body: "second revision" } });
    await settleAll(); // commit both revisions to the chain before erasing the plaintext

    await store.erase(post.txId); // destroy the first revision's plaintext + salt

    const report = await verifyEntityChain(store, connector, post.entityId);
    expect(report.ok, JSON.stringify(report.verdicts)).to.equal(true);
    expect(report.verdicts[0].contentMatches).to.equal("erased");
    expect(report.verdicts[1].contentMatches).to.equal(true);
  });
});
