import { expect } from "chai";
import { getWorld } from "./helpers/world.js";

/**
 * The anti-manipulation guarantee: a reaction (or comment) records BOTH the parent entity and
 * the exact revision it was given to. Editing the parent ("puppies are good" → "puppies are
 * jerks") must NOT transfer that endorsement to the new content. Revision-pinned counts stay
 * bound to the revision; entity-pinned counts follow the entity.
 */
describe("05 revision pinning: support stays bound to the content it endorsed", () => {
  it("editing a post does not move revision-pinned support to the new revision", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "puppies are good" } });
    const rev1 = post.txHash;

    // Bob endorses revision 1.
    await svc.react("bob", { type: "post", id: post.entityId }, "check");

    // Alice edits the post → revision 2.
    const edited = await svc.update({ entityId: post.entityId, author: "alice", content: { body: "puppies are jerks" } });
    const rev2 = edited.txHash;
    expect(rev2).to.not.equal(rev1);

    // Entity-pinned: the endorsement follows the entity.
    const byEntity = await store.getReactionCountsByEntity(post.entityId);
    expect(byEntity).to.deep.equal([{ kind: "check", count: 1 }]);

    // Revision-pinned: it stays on rev1, and does NOT count toward the current rev2.
    expect(await store.getReactionCountsByRevision(rev1)).to.deep.equal([{ kind: "check", count: 1 }]);
    expect(await store.getReactionCountsByRevision(rev2)).to.deep.equal([]);

    // The current revision (rev2) therefore shows zero endorsements until someone reacts to it.
    const current = await store.getCurrentRevisionHash(post.entityId);
    expect(current).to.equal(rev2);
    expect(await store.getReactionCountsByRevision(current!)).to.deep.equal([]);
  });
});
