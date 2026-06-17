import { expect } from "chai";
import { getWorld } from "./helpers/world.js";

/** Current state is a fold over the append-only log: edits, reaction changes, and deletes are
 *  all appended transactions; nothing is physically removed from the history. */
describe("03 state fold: edit, reaction change, delete", () => {
  it("editing a comment updates folded state but keeps both transactions in history", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "post" } });
    const comment = await svc.create({ type: "comment", author: "bob", content: { body: "original" }, parent: { type: "post", id: post.entityId } });

    await svc.update({ entityId: comment.entityId, author: "bob", content: { body: "edited" } });

    const state = await store.getEntityState(comment.entityId);
    expect((state!.content as { body: string }).body).to.equal("edited");
    const history = await store.getEntityHistory(comment.entityId);
    expect(history.map((h) => h.op)).to.deep.equal(["create", "update"]);
  });

  it("a reaction is mutually exclusive: changing check→cross flips the active reaction", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "post" } });

    await svc.react("bob", { type: "post", id: post.entityId }, "check");
    let counts = await store.getReactionCountsByEntity(post.entityId);
    expect(counts).to.deep.equal([{ kind: "check", count: 1 }]);

    await svc.react("bob", { type: "post", id: post.entityId }, "cross");
    counts = await store.getReactionCountsByEntity(post.entityId);
    expect(counts).to.deep.equal([{ kind: "cross", count: 1 }]); // one active reaction, flipped

    // Removing it leaves no active reaction.
    const existing = await store.getActiveSingleton("reaction", "bob", post.entityId);
    await svc.delete({ entityId: existing!.entityId, author: "bob" });
    expect(await store.getReactionCountsByEntity(post.entityId)).to.deep.equal([]);
  });

  it("deleting a post tombstones folded state but the history (and chain) remain", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "to delete" } });
    await svc.delete({ entityId: post.entityId, author: "alice" });

    const state = await store.getEntityState(post.entityId);
    expect(state!.isDeleted).to.equal(true);
    const history = await store.getEntityHistory(post.entityId);
    expect(history.map((h) => h.op)).to.deep.equal(["create", "delete"]);
  });

  it("only the author (or platform) may edit/delete", async () => {
    const { svc, store } = await getWorld();
    const post = await svc.create({ type: "post", author: "alice", content: { body: "mine" } });
    let threw = false;
    try {
      await svc.update({ entityId: post.entityId, author: "mallory", content: { body: "hijacked" } });
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
    const state = await store.getEntityState(post.entityId);
    expect((state!.content as { body: string }).body).to.equal("mine");
  });
});
