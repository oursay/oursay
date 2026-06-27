import { expect } from "chai";
import { getThread } from "../src/projection.js";
import { verifyEntityChain } from "../src/verify.js";
import { getWorld, settleAll } from "./helpers/world.js";

/**
 * Platform "removal" without breaking the audit trail: REDACTION withholds the plaintext from
 * every response (the commitment hash stands in) while RETAINING the raw content in the mutable
 * store for lawful access; ERASURE destroys the raw entirely. In both cases the append-only
 * chain is untouched and still verifies.
 */
describe("08 redaction & erasure: withhold from responses, retain or destroy the raw", () => {
  it("redaction: content withheld from public responses, retained internally, chain intact", async () => {
    const { svc, store, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { title: "Test post", body: "root" } });
    const comment = await svc.create({
      type: "comment",
      author: "bob",
      content: { body: "hateful content" },
      parent: { type: "post", id: post.entityId },
    });

    await settleAll(); // commit the comment to the chain before redacting

    // Platform redacts the comment's current revision.
    const head = await store.getHeadTx(comment.entityId);
    await store.redact(head!.txId);

    // PUBLIC view withholds the content; the commitment stands in.
    const pub = await store.getEntityStatePublic(comment.entityId);
    expect(pub!.withheld).to.equal(true);
    expect(pub!.content).to.equal(null);
    expect(pub!.contentHash).to.match(/^[0-9a-f]{64}$/);

    // The thread still SHOWS the comment (present + provably included), text withheld.
    const thread = await getThread(store, post.entityId);
    expect(thread!.comments[0].state.withheld).to.equal(true);
    expect(thread!.comments[0].state.content).to.equal(null);
    expect(JSON.stringify(thread)).to.not.include("hateful content");

    // INTERNAL: the raw content is RETAINED in the mutable store (for lawful access).
    const internal = await store.getEntityState(comment.entityId);
    expect((internal!.content as { body: string }).body).to.equal("hateful content");

    // The append-only chain is unaffected — still verifies.
    const report = await verifyEntityChain(store, connector, comment.entityId);
    expect(report.ok).to.equal(true);
  });

  it("erasure: raw content destroyed; the chain still verifies on hashes alone", async () => {
    const { svc, store, connector } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { title: "Test post", body: "root2" } });
    const comment = await svc.create({
      type: "comment",
      author: "bob",
      content: { body: "to be erased" },
      parent: { type: "post", id: post.entityId },
    });
    await settleAll(); // commit the comment to the chain before erasing
    const head = await store.getHeadTx(comment.entityId);
    await store.erase(head!.txId);

    const pub = await store.getEntityStatePublic(comment.entityId);
    expect(pub!.withheld).to.equal(true);
    expect(pub!.content).to.equal(null);

    // Internal read now also has no content (physically destroyed).
    const internal = await store.getEntityState(comment.entityId);
    expect(internal!.content).to.equal(null);

    const report = await verifyEntityChain(store, connector, comment.entityId);
    expect(report.ok).to.equal(true);
    expect(report.verdicts.at(-1)!.contentMatches).to.equal("erased");
  });
});
